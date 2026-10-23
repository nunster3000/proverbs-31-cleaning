begin;
create table private.work_gallery(
 id uuid primary key default gen_random_uuid(),object_path text not null unique,
 title text not null check(length(title) between 1 and 100),caption text not null default '' check(length(caption)<=1000),alt text not null check(length(alt) between 1 and 240),
 mime text not null,bytes bigint not null,kind text not null check(kind in('photo','video')),
 state text not null default 'uploading' check(state in('uploading','ready','removed')),
 published boolean not null default false,position integer not null default 0,
 sharing_approved_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
revoke all on private.work_gallery from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('work-gallery','work-gallery',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']) on conflict(id) do nothing;
create function public.api_work_gallery(p_action text default 'public',p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.work_gallery; v_id uuid; v_mime text; v_bytes bigint; ext text; ids uuid[];
begin
 if p_action='public' then return coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'title',g.title,'caption',g.caption,'alt',g.alt,'kind',g.kind,'mime',g.mime,'object_path',g.object_path) order by g.position,g.created_at) from private.work_gallery g where g.state='ready' and g.published),'[]');end if;
 if not private.account_user() or not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 if p_action in('reserve','update') and (length(coalesce(btrim(p_data->>'title'),'')) not between 1 and 100 or length(coalesce(btrim(p_data->>'alt'),'')) not between 1 and 240 or length(coalesce(p_data->>'caption',''))>1000) then raise exception 'Add a title and image/video description within the limits.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(310034);
 if p_action='list' then return coalesce((select jsonb_agg(to_jsonb(g) order by g.position,g.created_at) from private.work_gallery g where g.state<>'removed'),'[]');end if;
 if p_action='reserve' then
  if (select count(*) from private.work_gallery where state<>'removed')>=10 then raise exception 'Your gallery has 10 items. Remove an item before adding another.' using errcode='22023';end if;
  v_mime=p_data->>'mime';v_bytes=(p_data->>'bytes')::bigint;
  ext=case v_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' when 'video/webm' then 'webm' end;
  if ext is null or v_bytes is null or v_bytes<1 or v_bytes>(case when v_mime like 'image/%' then 20971520 else 52428800 end) then raise exception 'Choose a supported photo up to 20 MB or video up to 50 MB.' using errcode='22023';end if;
  v_id=gen_random_uuid();insert into private.work_gallery(id,object_path,title,caption,alt,mime,bytes,kind,position) values(v_id,'gallery/'||v_id||'.'||ext,btrim(p_data->>'title'),coalesce(p_data->>'caption',''),btrim(p_data->>'alt'),v_mime,v_bytes,case when v_mime like 'image/%' then 'photo' else 'video' end,coalesce((select max(position)+1 from private.work_gallery where state<>'removed'),0)) returning * into r;
  perform private.log(null,'gallery_upload_reserved',jsonb_build_object('gallery_id',r.id));return to_jsonb(r);
 end if;
 if p_action='reorder' then
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'ids');
  if cardinality(ids) is distinct from (select count(*)::int from private.work_gallery where state<>'removed') or (select count(distinct x) from unnest(ids)x)<>cardinality(ids) or exists(select 1 from unnest(ids)x where not exists(select 1 from private.work_gallery where id=x and state<>'removed')) then raise exception 'Gallery changed. Refresh and try again.' using errcode='40001';end if;
  update private.work_gallery g set position=u.pos,updated_at=now() from unnest(ids) with ordinality u(id,pos) where g.id=u.id;
  perform private.log(null,'gallery_reordered');return jsonb_build_object('saved',true);
 end if;
 select * into r from private.work_gallery where id=(p_data->>'id')::uuid for update;
 if r.id is null then raise exception 'Gallery item not found' using errcode='22023';end if;
 if p_action='get' then return to_jsonb(r);end if;
 if p_action='remove' then update private.work_gallery set state='removed',published=false,updated_at=now() where id=r.id;perform private.log(null,'gallery_removed',jsonb_build_object('gallery_id',r.id));return jsonb_build_object('removed',true);end if;
 if p_action='update' and r.state='ready' then
  if coalesce((p_data->>'published')::boolean,false) and coalesce((p_data->>'permission')::boolean,false)=false then raise exception 'Confirm you have permission to share this media publicly.' using errcode='22023';end if;
  update private.work_gallery set title=btrim(p_data->>'title'),caption=coalesce(p_data->>'caption',''),alt=btrim(p_data->>'alt'),published=coalesce((p_data->>'published')::boolean,false),sharing_approved_at=case when (p_data->>'permission')::boolean then now() else sharing_approved_at end,updated_at=now() where id=r.id returning * into r;
  perform private.log(null,'gallery_updated',jsonb_build_object('gallery_id',r.id,'published',r.published));return to_jsonb(r);
 end if;
 raise exception 'Unsupported gallery action' using errcode='22023';
end$$;
revoke all on function public.api_work_gallery(text,jsonb) from public;
grant execute on function public.api_work_gallery(text,jsonb) to anon,authenticated;
create function public.api_work_gallery_ready(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.work_gallery;
begin
 perform pg_advisory_xact_lock(310034);select * into r from private.work_gallery where id=p_id for update;
 if r.id is null or r.state='removed' then raise exception 'Gallery item unavailable' using errcode='22023';end if;
 if not exists(select 1 from storage.objects where bucket_id='work-gallery' and name=r.object_path and (metadata->>'size')::bigint=r.bytes and metadata->>'mimetype'=r.mime) then raise exception 'Upload is missing or incomplete. Retry the upload.' using errcode='22023';end if;
 update private.work_gallery set state='ready',updated_at=now() where id=p_id returning * into r;return to_jsonb(r);
end$$;
revoke all on function public.api_work_gallery_ready(uuid) from public,anon,authenticated;
grant execute on function public.api_work_gallery_ready(uuid) to service_role;
commit;
