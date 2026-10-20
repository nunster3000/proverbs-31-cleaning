begin;
create table private.guest_booking_access(id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),recipient_email text not null,link_hash text unique not null check(link_hash ~ '^[a-f0-9]{64}$'),session_hash text unique check(session_hash ~ '^[a-f0-9]{64}$'),link_expires_at timestamptz not null default now()+interval '30 minutes',session_expires_at timestamptz,redeemed_at timestamptz,revoked_at timestamptz,created_at timestamptz not null default now());
alter table private.guest_booking_access enable row level security;
revoke all on private.guest_booking_access from public,anon,authenticated;
alter table public.walkthrough_files alter column uploader_id drop not null;
alter table public.walkthrough_files add column guest_access_id uuid references private.guest_booking_access(id);
alter table public.walkthrough_files add constraint walkthrough_actor_required check((uploader_id is null) <> (guest_access_id is null));
alter table public.access_signatures alter column signer_id drop not null;
alter table public.access_signatures add column guest_access_id uuid references private.guest_booking_access(id);
alter table public.access_signatures add constraint signature_actor_required check((signer_id is null) <> (guest_access_id is null));
create function public.api_guest_issue(p_booking uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;c public.customers;g private.guest_booking_access;
begin
 if not public.is_owner() then raise exception 'Owner required' using errcode='42501';end if;
 select * into b from public.bookings where id=p_booking for update;select * into c from public.customers where id=b.customer_id;
 if b.id is null or b.status in('cancelled','completed') or c.account_enabled or c.email not like '%@%.%' then raise exception 'Active guest booking with a contact email required' using errcode='22023';end if;
 update private.guest_booking_access set revoked_at=now() where booking_id=b.id and revoked_at is null;
 insert into private.guest_booking_access(booking_id,recipient_email,link_hash) values(b.id,lower(trim(c.email)),p_hash) returning * into g;
 perform private.log(b.id,'guest_link_issued',jsonb_build_object('access_id',g.id));
 return jsonb_build_object('id',g.id,'recipient',g.recipient_email,'expires_at',g.link_expires_at);
end $$;
create function public.api_guest_revoke(p_booking uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_owner() then raise exception 'Owner required' using errcode='42501';end if;
 perform 1 from public.bookings where id=p_booking for update;
 update private.guest_booking_access set revoked_at=now() where booking_id=p_booking and revoked_at is null;
 perform private.log(p_booking,'guest_access_revoked');
end $$;
create function public.api_guest_exchange(p_link text,p_session text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g private.guest_booking_access;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 select * into g from private.guest_booking_access where link_hash=p_link for update;
 if g.id is null or g.revoked_at is not null or g.redeemed_at is not null or g.link_expires_at<=now() or not exists(select 1 from public.bookings b join public.customers c on c.id=b.customer_id where b.id=g.booking_id and not c.account_enabled and lower(trim(c.email))=g.recipient_email and b.status<>'cancelled') then raise exception 'Guest link expired or unavailable. Ask Gabrielle for a new link.' using errcode='42501';end if;
 update private.guest_booking_access set session_hash=p_session,session_expires_at=now()+interval '8 hours',redeemed_at=now() where id=g.id returning * into g;
 return jsonb_build_object('expires_at',g.session_expires_at);
end $$;
create function public.api_guest_booking(p_session text,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare g private.guest_booking_access;b public.bookings;f public.walkthrough_files;a public.access_forms;s public.access_signatures;receipt jsonb;key uuid=gen_random_uuid();result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 select * into g from private.guest_booking_access where session_hash=p_session;
 if g.id is null then raise exception 'Guest access expired or unavailable. Ask Gabrielle for a new link.' using errcode='42501';end if;
 select * into b from public.bookings where id=g.booking_id for update;
 select * into g from private.guest_booking_access where id=g.id for update;
 if g.revoked_at is not null or g.session_expires_at<=now() or g.redeemed_at is null or b.status='cancelled' or not exists(select 1 from public.customers c where c.id=b.customer_id and not c.account_enabled and lower(trim(c.email))=g.recipient_email) then raise exception 'Guest access expired or unavailable. Ask Gabrielle for a new link.' using errcode='42501';end if;
 if p_action='view' then
  select to_jsonb(x)||jsonb_build_object('form',to_jsonb(y)) into receipt from public.access_signatures x join public.access_forms y on y.id=x.form_id where x.booking_id=b.id and x.visit_snapshot=private.access_visit(b) order by x.signed_at desc limit 1;
  select * into a from public.access_forms where id=b.access_form_id or (b.access_form_id is null and active) limit 1;
  return jsonb_build_object('booking',to_jsonb(b)-'owner_notes'-'creator_id'-'request_key'-'customer_id','adjustments',coalesce((select jsonb_agg(jsonb_build_object('label',label,'cents',cents)) from public.quote_adjustments where booking_id=b.id),'[]'),'files',coalesce((select jsonb_agg(to_jsonb(x)-'path'-'uploader_id'-'guest_access_id') from public.walkthrough_files x where booking_id=b.id and status<>'deleted'),'[]'),'form',case when a.id is null then null else to_jsonb(a) end,'receipt',receipt,'visit',private.access_visit(b),'session_expires_at',g.session_expires_at);
 elsif p_action='approve' then
  if b.status in('completed','cancelled') or b.quote_status<>'awaiting_approval' or b.final_cents is null or coalesce((p_data->>'revision')::integer,-1)<>b.revision or coalesce((p_data->>'consent')::boolean,false)=false then raise exception 'Price changed or consent missing. Review the current quote.' using errcode='22023';end if;
  update public.bookings set quote_status='accepted' where id=b.id;
  perform private.log(b.id,'accept_quote',jsonb_build_object('guest_access_id',g.id,'revision',b.revision));
  return jsonb_build_object('saved',true);
 elsif p_action='sign' then
  if b.status<>'confirmed' or not coalesce((p_data->>'consent')::boolean,false) or not coalesce((p_data->>'electronic')::boolean,false) then raise exception 'Confirmed visit and both acknowledgements required' using errcode='22023';end if;
  select * into a from public.access_forms where id=(p_data->>'form_id')::uuid and (id=b.access_form_id or (b.access_form_id is null and active));
  if a.id is null or p_data->'visit' is distinct from private.access_visit(b) then raise exception 'Form or visit changed. Review again.' using errcode='22023';end if;
  insert into public.access_signatures(booking_id,form_id,guest_access_id,signer_name,visit_snapshot,consent) values(b.id,a.id,g.id,trim(p_data->>'name'),private.access_visit(b),jsonb_build_object('permission',true,'electronic_signature',true,'access_method','guest_booking_link','recipient_email',g.recipient_email)) on conflict(booking_id,form_id,visit_snapshot) do nothing returning * into s;
  if s.id is null then select * into s from public.access_signatures where booking_id=b.id and form_id=a.id and visit_snapshot=private.access_visit(b);end if;
  update public.bookings set access_form_id=a.id,access_signed_at=s.signed_at where id=b.id;
  perform private.log(b.id,'access_authorization_signed',jsonb_build_object('guest_access_id',g.id,'signature_id',s.id,'form_id',a.id));
  return jsonb_build_object('saved',true);
 elsif p_action='reserve' then
  if b.status not in('requested','awaiting_walkthrough') or b.invoice_issued then raise exception 'Walkthrough uploads are closed for this visit' using errcode='22023';end if;
  if coalesce((select count(*) from public.walkthrough_files where booking_id=b.id and purpose='walkthrough' and status<>'deleted'),0)>=6 or coalesce((select sum(bytes) from public.walkthrough_files where booking_id=b.id and purpose='walkthrough' and status<>'deleted'),0)+(p_data->>'bytes')::bigint>83886080 then raise exception 'Walkthrough file limit reached' using errcode='22023';end if;
  insert into public.walkthrough_files(id,booking_id,guest_access_id,path,filename,mime,bytes,room,notes,purpose) values(key,b.id,g.id,b.id::text||'/'||key::text,p_data->>'filename',p_data->>'mime',(p_data->>'bytes')::bigint,trim(p_data->>'room'),coalesce(p_data->>'notes',''),'walkthrough') returning * into f;
  return to_jsonb(f);
 elsif p_action in('file','finish','remove') then
  select * into f from public.walkthrough_files where id=(p_data->>'id')::uuid and booking_id=b.id and status<>'deleted' for update;
  if f.id is null then raise exception 'File unavailable' using errcode='42501';end if;
  if p_action='file' then
   if f.status<>'ready' then raise exception 'File verification pending' using errcode='22023';end if;
  elsif p_action='remove' then
   if f.purpose<>'walkthrough' or b.status not in('requested','awaiting_walkthrough') or b.invoice_issued then raise exception 'File removal unavailable' using errcode='22023';end if;
   update public.walkthrough_files set status='deleted' where id=f.id;
   update public.bookings set reviewed=false,walkthrough_approved=false,quote_status='not_reviewed',final_cents=null,revision=revision+1 where id=b.id;
   perform private.log(b.id,'walkthrough_removed',jsonb_build_object('guest_access_id',g.id,'file_id',f.id));
  else
   if f.purpose<>'walkthrough' then raise exception 'File unavailable' using errcode='42501';end if;
   if f.status='ready' then return to_jsonb(f);end if;
   if f.purpose<>'walkthrough' or b.status not in('requested','awaiting_walkthrough') or b.invoice_issued then raise exception 'Walkthrough uploads are closed for this visit' using errcode='22023';end if;
   if not exists(select 1 from storage.objects o where bucket_id='walkthroughs' and name=f.path and (metadata->>'size')::bigint=f.bytes and metadata->>'mimetype'=f.mime) then raise exception 'Upload does not match reservation' using errcode='22023';end if;
   if f.status<>'ready' then
    update public.walkthrough_files set status='ready' where id=f.id;
    update public.bookings set reviewed=false,walkthrough_approved=false,quote_status='not_reviewed',final_cents=null,revision=revision+1 where id=b.id;
    perform private.log(b.id,'walkthrough_uploaded',jsonb_build_object('guest_access_id',g.id,'file_id',f.id));
   end if;
  end if;
  return to_jsonb(f);
 elsif p_action='pending_file' then
  select * into f from public.walkthrough_files where id=(p_data->>'id')::uuid and booking_id=b.id and purpose='walkthrough' and status<>'deleted';
  if f.id is null then raise exception 'File unavailable' using errcode='42501';end if;return to_jsonb(f);
 else raise exception 'Guest action unavailable' using errcode='42501';end if;
end $$;
create function public.api_guest_close(p_session text) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 update private.guest_booking_access set revoked_at=now() where session_hash=p_session and revoked_at is null;
end $$;
revoke all on function public.api_guest_issue(uuid,text),public.api_guest_revoke(uuid),public.api_guest_exchange(text,text),public.api_guest_booking(text,text,jsonb),public.api_guest_close(text) from public,anon,authenticated;
grant execute on function public.api_guest_issue(uuid,text),public.api_guest_revoke(uuid) to authenticated;
grant execute on function public.api_guest_exchange(text,text),public.api_guest_booking(text,text,jsonb),public.api_guest_close(text) to service_role;
commit;
