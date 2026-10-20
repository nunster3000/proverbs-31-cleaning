-- Booking milestones follow recorded deposits and owner-approved walkthroughs.
begin;
alter table public.bookings add column walkthrough_approved boolean not null default false;
alter table public.walkthrough_files add column purpose text not null default 'walkthrough' check(purpose in('walkthrough','completion'));
create or replace function public.api_booking_action(p_id uuid,p_action text,p_data jsonb default '{}',p_request uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings; owner boolean=public.is_owner(); amount integer; proposed integer; customer_email text;
begin
 perform 1 from public.business_settings where id=true for update;
 select * into b from public.bookings where id=p_id for update;
 if b.id is null or not(owner or private.owns_booking(p_id)) then raise exception 'Booking unavailable' using errcode='42501'; end if;
 select email into customer_email from public.customers where id=b.customer_id;
 if p_action='accept_quote' then
  if not private.owns_booking(p_id) or b.quote_status<>'awaiting_approval' or coalesce((p_data->>'revision')::integer,-1)<>b.revision then raise exception 'Quote changed; review the current quote' using errcode='22023'; end if;
  update public.bookings set quote_status='accepted' where id=p_id;
 elsif p_action='request_change' then
  if not private.owns_booking(p_id) or b.status in('completed','cancelled') then raise exception 'Change not available' using errcode='42501'; end if;
  insert into public.booking_requests(booking_id,kind,notes) values(p_id,p_data->>'kind',trim(p_data->>'notes'));
 elsif not owner then raise exception 'Owner access required' using errcode='42501';
 elsif p_action='external_approval' then
  if b.invoice_issued or b.property->>'source' is distinct from 'owner_manual' or b.quote_status<>'awaiting_approval' or length(trim(coalesce(p_data->>'notes',''))) not between 1 and 2000 then raise exception 'A manual booking awaiting approval and approval notes are required' using errcode='22023'; end if;
  update public.bookings set quote_status='accepted' where id=p_id;
 elsif p_action='approve_booking' then
  if b.status not in('requested','awaiting_walkthrough','confirmed') or not b.reviewed or b.deposit_paid_cents<(b.quote_snapshot->>'deposit_cents')::integer then raise exception 'Deposit and walkthrough review are required before confirming the booking' using errcode='22023';end if;
  if b.property->>'source' is distinct from 'owner_manual' and not exists(select 1 from public.walkthrough_files where booking_id=p_id and status='ready' and purpose='walkthrough') then raise exception 'Customer walkthrough uploads are required before approval' using errcode='22023';end if;
  update public.bookings set walkthrough_approved=true,status='confirmed' where id=p_id;
  if not b.walkthrough_approved then insert into public.notification_outbox(booking_id,kind,recipient) values(p_id,'booking_updated',customer_email);end if;
 elsif p_action='status' then
  if p_data->>'status' in('confirmed','on_the_way','in_progress','completed') and (not b.walkthrough_approved or b.deposit_paid_cents<(b.quote_snapshot->>'deposit_cents')::integer) then raise exception 'Deposit and approved walkthrough are required' using errcode='22023';end if;
  if p_data->>'status'='on_the_way' and b.status not in('confirmed','on_the_way') or p_data->>'status'='in_progress' and b.status not in('on_the_way','in_progress') or p_data->>'status'='completed' and b.status not in('in_progress','completed') then raise exception 'Update visit progress in order' using errcode='22023';end if;
  if p_data->>'status' in('requested','awaiting_walkthrough') and b.status not in('requested','awaiting_walkthrough') then raise exception 'Confirmed visit progress cannot be reset here' using errcode='22023';end if;
  if coalesce(p_data->>'status','') not in('requested','awaiting_walkthrough','confirmed','on_the_way','in_progress','completed','cancelled') then raise exception 'Invalid booking status' using errcode='22023';end if;
  if b.status=p_data->>'status' then return to_jsonb(b);end if;
  if p_data->>'status'='completed' and b.quote_status<>'accepted' then raise exception 'Customer quote approval required before completion' using errcode='22023'; end if;
  if p_data->>'status'='cancelled' and coalesce(trim(p_data->>'reason'),'')='' then raise exception 'Cancellation reason required' using errcode='22023'; end if;
  if b.invoice_issued then raise exception 'An issued invoice cannot be changed; use a documented correction process' using errcode='22023'; end if;
  update public.bookings set status=p_data->>'status' where id=p_id;
  insert into public.notification_outbox(booking_id,kind,recipient) values(p_id,case when p_data->>'status'='completed' then 'service_completed' else 'booking_updated' end,customer_email);
 elsif p_action='reschedule' then
  if b.status in('completed','cancelled') or b.invoice_issued or coalesce(trim(p_data->>'reason'),'')='' or not private.slot_available((p_data->>'date')::date,p_data->>'arrival',p_id) then raise exception 'Choose an available date and provide a reason' using errcode='22023'; end if;
  update public.bookings set visit_date=(p_data->>'date')::date,arrival=p_data->>'arrival' where id=p_id;
 elsif p_action='review' then
  if b.invoice_issued or length(coalesce(trim(p_data->>'notes'),'')) not between 1 and 2000 or (not coalesce((p_data->>'external')::boolean,false) and not exists(select 1 from public.walkthrough_files where booking_id=p_id and status='ready')) then raise exception 'Walkthrough media or an external review and notes are required' using errcode='22023'; end if;
  update public.bookings set reviewed=true,review_notes=p_data->>'notes' where id=p_id;
 elsif p_action='adjust' then
  amount=(p_data->>'cents')::integer;
  if b.invoice_issued or amount is null or amount=0 then raise exception 'Invalid adjustment' using errcode='22023'; end if;
  proposed=(b.quote_snapshot->>'total_cents')::integer+coalesce((select sum(cents) from public.quote_adjustments where booking_id=p_id),0)+amount;
  if proposed<b.deposit_paid_cents+b.final_paid_cents then raise exception 'Total cannot be less than recorded payments; review refunds separately' using errcode='22023'; end if;
  insert into public.quote_adjustments(booking_id,label,cents) values(p_id,trim(p_data->>'label'),amount);
  update public.bookings set final_cents=null,quote_status='not_reviewed',revision=revision+1 where id=p_id;
 elsif p_action='prepare_quote' then
  if not b.reviewed or b.invoice_issued then raise exception 'Review the walkthrough first' using errcode='22023'; end if;
  update public.bookings set final_cents=(quote_snapshot->>'total_cents')::integer+coalesce((select sum(cents) from public.quote_adjustments where booking_id=p_id),0),quote_status='awaiting_approval',revision=revision+1 where id=p_id;
  insert into public.notification_outbox(booking_id,kind,recipient) values(p_id,'quote_ready',customer_email);
 elsif p_action='record_approval' then
  if b.quote_status<>'awaiting_approval' or coalesce(trim(p_data->>'notes'),'')='' then raise exception 'Pending quote and approval notes required' using errcode='22023'; end if;
  update public.bookings set quote_status='accepted' where id=p_id;
 elsif p_action='issue_invoice' then
  if not b.reviewed or b.quote_status<>'accepted' or b.status<>'completed' or b.final_cents is null then raise exception 'Review, customer approval, and completion are required' using errcode='22023'; end if;
  if not b.invoice_issued then insert into public.notification_outbox(booking_id,kind,recipient) values(p_id,'final_balance_ready',customer_email); end if;
  update public.bookings set invoice_issued=true where id=p_id;
 elsif p_action='record_payment' then
  if p_request is null then raise exception 'Payment request ID required' using errcode='22023'; end if;
  if exists(select 1 from public.payment_records where request_key=p_request) then
   if not exists(select 1 from public.payment_records where request_key=p_request and booking_id=p_id and cents=(p_data->>'cents')::integer and kind=p_data->>'kind') then raise exception 'Payment request ID already used' using errcode='22023'; end if;return to_jsonb(b);
  end if;
  amount=(p_data->>'cents')::integer;
  if amount is null or amount<=0 or amount+b.deposit_paid_cents+b.final_paid_cents>coalesce(b.final_cents,(b.quote_snapshot->>'total_cents')::integer) or (p_data->>'kind'='final' and not b.invoice_issued) then raise exception 'Payment amount or invoice state invalid' using errcode='22023'; end if;
  insert into public.payment_records(request_key,booking_id,kind,cents,method,recorded_by) values(p_request,p_id,p_data->>'kind',amount,trim(p_data->>'method'),auth.uid());
  update public.bookings set deposit_paid_cents=deposit_paid_cents+case when p_data->>'kind'='deposit' then amount else 0 end,final_paid_cents=final_paid_cents+case when p_data->>'kind'='final' then amount else 0 end where id=p_id;
  update public.bookings set status='awaiting_walkthrough' where id=p_id and status='requested' and deposit_paid_cents>=(quote_snapshot->>'deposit_cents')::integer;
 elsif p_action='notes' then
  if length(coalesce(p_data->>'notes',''))>3000 then raise exception 'Notes too long' using errcode='22023'; end if;insert into public.owner_notes(booking_id,notes) values(p_id,coalesce(p_data->>'notes','')) on conflict(booking_id) do update set notes=excluded.notes;
 elsif p_action='resolve_request' then update public.booking_requests set resolved=true where id=(p_data->>'request_id')::uuid and booking_id=p_id;
 else raise exception 'Unknown action' using errcode='22023';end if;
 perform private.log(p_id,p_action,p_data);
 return (select to_jsonb(x)-'owner_notes' from public.bookings x where id=p_id);
end $$;
create or replace function public.api_upload_request(p_id uuid,p_file jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.walkthrough_files;b public.bookings;key uuid=gen_random_uuid();
begin select * into b from public.bookings where id=p_id for update;if not(public.is_owner() or private.owns_booking(p_id)) or b.id is null or b.invoice_issued or b.status='cancelled' then raise exception 'Walkthrough upload unavailable' using errcode='42501';end if;
 if coalesce(p_file->>'purpose','walkthrough')='completion' then
  if not public.is_owner() or b.status not in('in_progress','completed') or not b.walkthrough_approved or b.quote_status<>'accepted' or b.deposit_paid_cents<(b.quote_snapshot->>'deposit_cents')::integer then raise exception 'Completion uploads require an approved visit in progress' using errcode='42501';end if;
 elsif coalesce(p_file->>'purpose','walkthrough')<>'walkthrough' or b.status not in('requested','awaiting_walkthrough') then raise exception 'Walkthrough uploads are closed for this visit' using errcode='42501';end if;
 if(select count(*) from public.walkthrough_files where booking_id=p_id and status<>'deleted' and purpose=coalesce(p_file->>'purpose','walkthrough'))>=6 or coalesce((select sum(bytes) from public.walkthrough_files where booking_id=p_id and status<>'deleted' and purpose=coalesce(p_file->>'purpose','walkthrough')),0)+(p_file->>'bytes')::bigint>83886080 then raise exception 'Walkthrough file limit reached' using errcode='22023';end if;
 insert into public.walkthrough_files(id,booking_id,uploader_id,path,filename,mime,bytes,room,notes,purpose) values(key,p_id,auth.uid(),p_id::text||'/'||key::text,p_file->>'filename',p_file->>'mime',(p_file->>'bytes')::bigint,trim(p_file->>'room'),coalesce(p_file->>'notes',''),coalesce(p_file->>'purpose','walkthrough')) returning * into f;return to_jsonb(f);
end $$;
create or replace function public.api_upload_finish(p_file uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.walkthrough_files;b public.bookings;
begin select * into f from public.walkthrough_files where id=p_file;select * into b from public.bookings where id=f.booking_id for update;
 if f.status='ready' and (exists(select 1 from private.owner_accounts where user_id=p_actor) or exists(select 1 from public.customers where id=b.customer_id and auth_user_id=p_actor)) then return to_jsonb(f);end if;
 if f.id is null or not(exists(select 1 from private.owner_accounts where user_id=p_actor) or exists(select 1 from public.customers where id=b.customer_id and auth_user_id=p_actor)) or b.invoice_issued or b.status='cancelled' or (b.status='completed' and f.purpose<>'completion') then raise exception 'File unavailable' using errcode='42501';end if;
 if not exists(select 1 from storage.objects o where bucket_id='walkthroughs' and name=f.path and (metadata->>'size')::bigint=f.bytes and metadata->>'mimetype'=f.mime) then raise exception 'Uploaded file does not match its reservation' using errcode='22023';end if;
 if f.purpose='completion' then
  if not exists(select 1 from private.owner_accounts where user_id=p_actor) or b.status not in('in_progress','completed') or not b.walkthrough_approved or b.quote_status<>'accepted' or b.deposit_paid_cents<(b.quote_snapshot->>'deposit_cents')::integer then raise exception 'Completion uploads require an approved visit in progress' using errcode='42501';end if;
  update public.walkthrough_files set status='ready' where id=f.id;
  update public.bookings set status='completed' where id=b.id;
  if b.status<>'completed' then insert into public.notification_outbox(booking_id,kind,recipient) select b.id,'service_completed',email from public.customers where id=b.customer_id;end if;
 else
  if b.status not in('requested','awaiting_walkthrough') then raise exception 'Walkthrough uploads are closed for this visit' using errcode='42501';end if;
  update public.walkthrough_files set status='ready' where id=f.id;
  update public.bookings set reviewed=false,walkthrough_approved=false,quote_status='not_reviewed',final_cents=null,revision=revision+1 where id=f.booking_id;
 end if;
 insert into public.audit_events(actor_id,booking_id,action,details) values(p_actor,f.booking_id,case when f.purpose='completion' then 'completion_uploaded' else 'walkthrough_uploaded' end,jsonb_build_object('file_id',f.id));f.status='ready';return to_jsonb(f);
end $$;
create or replace function public.api_remove_upload(p_file uuid) returns void language plpgsql security definer set search_path='' as $$
declare f public.walkthrough_files;b public.bookings;
begin select * into f from public.walkthrough_files where id=p_file;select * into b from public.bookings where id=f.booking_id for update;if f.id is null or not(public.is_owner() or private.owns_booking(f.booking_id)) or b.invoice_issued or b.status in('cancelled','completed') then raise exception 'File unavailable' using errcode='42501';end if;
 if f.purpose='walkthrough' and b.status not in('requested','awaiting_walkthrough') then raise exception 'Walkthrough changes are closed for this visit' using errcode='42501';end if;
 if f.purpose='completion' and not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 update public.walkthrough_files set status='deleted' where id=f.id;update public.bookings set reviewed=false,walkthrough_approved=false,quote_status='not_reviewed',final_cents=null,revision=revision+1 where id=f.booking_id and f.purpose='walkthrough';perform private.log(f.booking_id,'walkthrough_removed',jsonb_build_object('file_id',f.id));end $$;
commit;
