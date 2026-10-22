-- Owner-editable questionnaire versions and private drafts; no published form is changed.
begin;
alter table public.access_forms add column configuration jsonb not null default '{}';
create table private.agreement_draft(id boolean primary key default true check(id),revision integer not null default 1,payload jsonb not null,updated_at timestamptz not null default now());
alter table private.agreement_draft enable row level security;
revoke all on private.agreement_draft from public,anon,authenticated;
create function private.valid_agreement_configuration(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare q jsonb;seen text[]='{}';o jsonb;core_count integer=0;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>24000 or p->>'representative_style' is null or p->>'representative_style' not in('classic','modern','formal') or jsonb_typeof(p->'questions') is distinct from 'array' or jsonb_array_length(p->'questions') not between 3 and 20 then return false;end if;
 if exists(select 1 from jsonb_object_keys(p) k where k not in('representative_style','questions')) then return false;end if;
 for q in select value from jsonb_array_elements(p->'questions') loop
  if jsonb_typeof(q)<>'object' or exists(select 1 from jsonb_object_keys(q) k where k not in('id','label','type','required','step','options')) then return false;end if;
  if jsonb_typeof(q->'label') is distinct from 'string' or q->>'id' is null or q->>'id'=any(seen) or q->>'id' !~ '^(client_name|phone|entry_method|entry_instructions|security_notes|pets_safety|property_care|emergency_contact|other_services|q_[a-z0-9]{8,32})$' or length(trim(coalesce(q->>'label',''))) not between 1 and 160 or q->>'type' is null or q->>'type' not in('text','long','choice','yesno') or jsonb_typeof(q->'required') is distinct from 'boolean' or q->>'step' is null or q->>'step' not in('0','1') then return false;end if;
  seen=array_append(seen,q->>'id');
  if q->>'id' in('client_name','phone') then
   if q->>'type'<>'text' or q->>'step'<>'0' or q->'required'<>'true'::jsonb then return false;end if;core_count=core_count+1;
  elsif q->>'id'='entry_method' then
   if q->>'type'<>'choice' or q->>'step'<>'1' or q->'required'<>'true'::jsonb or q->'options' is distinct from '["I will be present","Key handoff","Lockbox or keypad","Other arrangement"]'::jsonb then return false;end if;core_count=core_count+1;
  elsif q->>'step'<>'1' then return false;end if;
  if q->>'type'='choice' then
   if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 2 and 8 then return false;end if;
   for o in select value from jsonb_array_elements(q->'options') loop
    if jsonb_typeof(o)<>'string' or length(trim(o#>>'{}')) not between 1 and 100 then return false;end if;
   end loop;
   if (select count(*) from jsonb_array_elements(q->'options'))<>(select count(distinct value) from jsonb_array_elements(q->'options')) then return false;end if;
  elsif q ? 'options' then return false;end if;
 end loop;
 return core_count=3;
end $$;
create function private.validate_configured_answers(p jsonb,c jsonb) returns void language plpgsql immutable set search_path='' as $$
declare q jsonb;v text;k text;
begin
 if not private.valid_agreement_configuration(c) or p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>44000 then raise exception 'Complete the current questionnaire' using errcode='22023';end if;
 for k in select jsonb_object_keys(p) loop
  if not exists(select 1 from jsonb_array_elements(c->'questions') item(value) where item.value->>'id'=k) or jsonb_typeof(p->k)<>'string' then raise exception 'Unknown questionnaire answer' using errcode='22023';end if;
 end loop;
 for q in select value from jsonb_array_elements(c->'questions') loop
  v=trim(coalesce(p->>(q->>'id'),''));
  if (q->>'required')::boolean and v='' then raise exception 'Answer all required questions' using errcode='22023';end if;
  if length(v)>(case when q->>'type'='long' then 2000 else 200 end) then raise exception 'Questionnaire answer is too long' using errcode='22023';end if;
  if v<>'' and ((q->>'type'='choice' and not (q->'options' ? v)) or (q->>'type'='yesno' and v not in('Yes','No'))) then raise exception 'Choose a listed answer' using errcode='22023';end if;
 end loop;
 if length(trim(p->>'client_name')) not between 3 and 120 or length(trim(p->>'phone')) not between 7 and 40 then raise exception 'Provide your name and phone' using errcode='22023';end if;
end $$;
revoke all on function private.valid_agreement_configuration(jsonb),private.validate_configured_answers(jsonb,jsonb) from public,anon,authenticated;
create function public.api_agreement_draft(p_data jsonb default null,p_expected integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.agreement_draft;
begin
 if not public.is_owner() then raise exception 'Owner required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(73131017);
 select * into d from private.agreement_draft where id=true for update;
 if p_data is not null then
  if p_expected is distinct from coalesce(d.revision,0) then raise exception 'Draft changed; reload before saving' using errcode='40001';end if;
  if not private.valid_agreement_configuration(p_data->'configuration') or length(trim(coalesce(p_data->>'title',''))) not between 3 and 160 or length(coalesce(p_data->>'body','')) not between 40 and 30000 or length(trim(coalesce(p_data->>'representative',''))) not between 3 and 120 then raise exception 'Check the agreement draft and questions' using errcode='22023';end if;
  insert into private.agreement_draft(id,payload) values(true,p_data) on conflict(id) do update set payload=excluded.payload,revision=private.agreement_draft.revision+1,updated_at=now() returning * into d;
  perform private.log(null,'agreement_draft_saved',jsonb_build_object('revision',d.revision));
 end if;
 return case when d.id is null then jsonb_build_object('revision',0,'payload',null) else to_jsonb(d)-'id' end;
end $$;
revoke all on function public.api_agreement_draft(jsonb,integer) from public,anon;
grant execute on function public.api_agreement_draft(jsonb,integer) to authenticated;
drop function public.api_publish_access_form(text,text,uuid,text,boolean);
create or replace function public.api_publish_access_form(p_title text,p_body text,p_previous uuid default null,p_representative text default '',p_automatic boolean default false,p_configuration jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare current_id uuid; result public.access_forms;
begin
 if not public.is_owner() then raise exception 'Owner required' using errcode='42501';end if;
 if p_configuration<>'{}'::jsonb and not private.valid_agreement_configuration(p_configuration) then raise exception 'Invalid questionnaire configuration' using errcode='22023';end if;
 perform pg_advisory_xact_lock(73131011);
 select id into current_id from public.access_forms where active;
 if current_id is distinct from p_previous then raise exception 'Form changed; reload before publishing' using errcode='40001';end if;
 update public.access_forms set active=false where active;
 if p_automatic and length(trim(p_representative)) not between 3 and 120 then raise exception 'Representative name required' using errcode='22023';end if;
 insert into public.access_forms(title,body,questionnaire_version,representative_name,automatic_representative,representative_authorized_at,representative_authorized_by,configuration) values(trim(p_title),trim(p_body),case when p_configuration='{}'::jsonb then 1 else 2 end,trim(p_representative),p_automatic,case when p_automatic then now() end,case when p_automatic then auth.uid() end,p_configuration) returning * into result;
 if p_configuration<>'{}'::jsonb then insert into private.agreement_draft(id,payload) values(true,jsonb_build_object('title',p_title,'body',p_body,'representative',p_representative,'configuration',p_configuration)) on conflict(id) do update set payload=excluded.payload,revision=private.agreement_draft.revision+1,updated_at=now();end if;
 perform private.log(null,'access_form_published',jsonb_build_object('form_id',result.id));
 return to_jsonb(result);
end $$;
create or replace function public.api_access_form(p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings; f public.access_forms; receipt jsonb;
begin
 if not private.account_user() then raise exception 'Verified account required' using errcode='42501';end if;
 if p_id is not null then
  select * into b from public.bookings where id=p_id;
  if not found or not(public.is_owner() or private.owns_booking(p_id)) then raise exception 'Booking not accessible' using errcode='42501';end if;
  select to_jsonb(s) || jsonb_build_object('form',to_jsonb(a)) into receipt from public.access_signatures s join public.access_forms a on a.id=s.form_id where s.booking_id=p_id and s.visit_snapshot=private.access_visit(b) order by s.signed_at desc limit 1;
  if b.access_form_id is not null then select * into f from public.access_forms where id=b.access_form_id;else select * into f from public.access_forms where active;end if;
 elsif public.is_owner() then select * into f from public.access_forms where active;
 else raise exception 'Owner required' using errcode='42501';end if;
 return jsonb_build_object('form',case when f.id is null then null else to_jsonb(f) end,'receipt',receipt,'builder_version',2,'questionnaire_version',1,'details',case when p_id is null then null else private.agreement_details(b) end,'visit',case when p_id is null then null else private.access_visit(b) end);
end $$;
create or replace function public.api_sign_access(p_id uuid,p_form uuid,p_visit jsonb,p_name text,p_consent boolean,p_electronic boolean,p_answers jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings; f public.access_forms; result public.access_signatures;
begin
 if not private.account_user() or not private.owns_booking(p_id) then raise exception 'Only this booking customer can sign' using errcode='42501';end if;
 select * into b from public.bookings where id=p_id for update;
 if b.status<>'confirmed' then raise exception 'Sign after the booking is confirmed and before travel' using errcode='22023';end if;
 if not coalesce(p_consent,false) or not coalesce(p_electronic,false) then raise exception 'Both acknowledgements are required' using errcode='22023';end if;
 select * into f from public.access_forms where id=p_form and (id=b.access_form_id or (b.access_form_id is null and active));
 if not found or p_visit is distinct from private.access_visit(b) then raise exception 'Form or visit changed; review again' using errcode='40001';end if;
 if f.questionnaire_version=2 then perform private.validate_configured_answers(p_answers,f.configuration);end if;
 if f.questionnaire_version=1 then perform private.agreement_answers(p_answers);end if;
 insert into public.access_signatures(booking_id,form_id,signer_id,signer_name,visit_snapshot,consent,answers,agreement_snapshot,representative_name,representative_signed_at,representative_id) values(p_id,f.id,auth.uid(),trim(p_name),p_visit,jsonb_build_object('permission',true,'electronic_signature',true),case when f.questionnaire_version in(1,2) then p_answers else '{}' end,private.agreement_details(b),case when f.automatic_representative then f.representative_name end,case when f.automatic_representative then now() end,case when f.automatic_representative then f.representative_authorized_by end) on conflict(booking_id,form_id,visit_snapshot) do nothing returning * into result;
 if result.id is null then select * into result from public.access_signatures where booking_id=p_id and form_id=f.id and visit_snapshot=p_visit;end if;
 update public.bookings set access_form_id=f.id,access_signed_at=result.signed_at where id=p_id;
 perform private.log(p_id,'access_authorization_signed',jsonb_build_object('signature_id',result.id,'form_id',f.id));
 return to_jsonb(result);
end $$;
create or replace function public.api_guest_booking(p_session text,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
  return jsonb_build_object('booking',to_jsonb(b)-'owner_notes'-'creator_id'-'request_key'-'customer_id','adjustments',coalesce((select jsonb_agg(jsonb_build_object('label',label,'cents',cents)) from public.quote_adjustments where booking_id=b.id),'[]'),'files',coalesce((select jsonb_agg(to_jsonb(x)-'path'-'uploader_id'-'guest_access_id') from public.walkthrough_files x where booking_id=b.id and status<>'deleted'),'[]'),'form',case when a.id is null then null else to_jsonb(a) end,'receipt',receipt,'visit',private.access_visit(b),'session_expires_at',g.session_expires_at,'questionnaire_version',1,'details',private.agreement_details(b));
 elsif p_action='approve' then
  if b.status in('completed','cancelled') or b.quote_status<>'awaiting_approval' or b.final_cents is null or coalesce((p_data->>'revision')::integer,-1)<>b.revision or coalesce((p_data->>'consent')::boolean,false)=false then raise exception 'Price changed or consent missing. Review the current quote.' using errcode='22023';end if;
  update public.bookings set quote_status='accepted' where id=b.id;
  perform private.log(b.id,'accept_quote',jsonb_build_object('guest_access_id',g.id,'revision',b.revision));
  return jsonb_build_object('saved',true);
 elsif p_action='sign' then
  if b.status<>'confirmed' or not coalesce((p_data->>'consent')::boolean,false) or not coalesce((p_data->>'electronic')::boolean,false) then raise exception 'Confirmed visit and both acknowledgements required' using errcode='22023';end if;
  select * into a from public.access_forms where id=(p_data->>'form_id')::uuid and (id=b.access_form_id or (b.access_form_id is null and active));
  if a.id is null or p_data->'visit' is distinct from private.access_visit(b) then raise exception 'Form or visit changed. Review again.' using errcode='22023';end if;
  if a.questionnaire_version=2 then perform private.validate_configured_answers(p_data->'answers',a.configuration);end if;
  if a.questionnaire_version=1 then perform private.agreement_answers(p_data->'answers');end if;
  insert into public.access_signatures(booking_id,form_id,guest_access_id,signer_name,visit_snapshot,consent,answers,agreement_snapshot,representative_name,representative_signed_at,representative_id) values(b.id,a.id,g.id,trim(p_data->>'name'),private.access_visit(b),jsonb_build_object('permission',true,'electronic_signature',true,'access_method','guest_booking_link','recipient_email',g.recipient_email),case when a.questionnaire_version in(1,2) then p_data->'answers' else '{}' end,private.agreement_details(b),case when a.automatic_representative then a.representative_name end,case when a.automatic_representative then now() end,case when a.automatic_representative then a.representative_authorized_by end) on conflict(booking_id,form_id,visit_snapshot) do nothing returning * into s;
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
revoke all on function public.api_publish_access_form(text,text,uuid,text,boolean,jsonb) from public,anon;
grant execute on function public.api_publish_access_form(text,text,uuid,text,boolean,jsonb) to authenticated;
commit;
