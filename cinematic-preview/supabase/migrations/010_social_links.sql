begin;
create function private.valid_social_links(p_links jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item record;pattern text;link text;
begin
 if p_links is null or jsonb_typeof(p_links)<>'object' then return false;end if;
 for item in select key,value from jsonb_each(p_links) loop
  pattern=case item.key
   when 'facebook' then '^https://(www\.|m\.)?facebook\.com/[^/?#[:space:]][^[:space:]]*$'
   when 'instagram' then '^https://(www\.)?instagram\.com/[^/?#[:space:]][^[:space:]]*$'
   when 'tiktok' then '^https://(www\.)?tiktok\.com/[^/?#[:space:]][^[:space:]]*$'
   when 'youtube' then '^https://(www\.)?youtube\.com/[^/?#[:space:]][^[:space:]]*$'
   when 'linkedin' then '^https://(www\.)?linkedin\.com/[^/?#[:space:]][^[:space:]]*$'
   when 'x' then '^https://(www\.)?(x|twitter)\.com/[^/?#[:space:]][^[:space:]]*$'
   else null end;
  if pattern is null or jsonb_typeof(item.value)<>'object' or jsonb_typeof(item.value->'enabled') is distinct from 'boolean' or jsonb_typeof(item.value->'url') is distinct from 'string' then return false;end if;
  if exists(select 1 from jsonb_object_keys(item.value) k where k not in('enabled','url')) then return false;end if;
  link=item.value->>'url';
  if length(link)>2048 or (link<>'' and link !~ pattern) or ((item.value->>'enabled')::boolean and link='') then return false;end if;
 end loop;
 return true;
end $$;
revoke all on function private.valid_social_links(jsonb) from public,anon,authenticated;
alter table public.site_content add column social_links jsonb not null default '{}' check(private.valid_social_links(social_links));
create or replace function public.api_owner_content(p_data jsonb,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_row public.site_content;next_path text;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 select * into current_row from public.site_content where id=true for update;
 if p_expected is null or p_expected<>current_row.revision then raise exception 'Website content changed. Reload it before saving.' using errcode='22023';end if;
 next_path=case when p_data ? 'photo_path' then nullif(p_data->>'photo_path','') else current_row.photo_path end;
 if next_path is not null and not exists(select 1 from storage.objects where bucket_id='site-media' and name=next_path) then raise exception 'Upload the public company photo first' using errcode='22023';end if;
 update public.site_content set company_intro=coalesce(p_data->>'company_intro',company_intro),founder_name=coalesce(p_data->>'founder_name',founder_name),founder_bio=coalesce(p_data->>'founder_bio',founder_bio),contact_intro=coalesce(p_data->>'contact_intro',contact_intro),contact_email=coalesce(p_data->>'contact_email',contact_email),contact_phone=coalesce(p_data->>'contact_phone',contact_phone),service_area=coalesce(p_data->>'service_area',service_area),service_area_note=coalesce(p_data->>'service_area_note',service_area_note),photo_path=next_path,social_links=coalesce(p_data->'social_links',social_links),revision=revision+1,updated_at=now() where id=true returning * into current_row;
 perform private.log(null,'website_content_updated',jsonb_build_object('revision',current_row.revision));
 return to_jsonb(current_row);
end $$;
commit;
