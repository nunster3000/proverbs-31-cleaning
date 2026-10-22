-- Route existing booking decisions to specific branded templates. No access grants or auth flags change.
begin;
alter table public.notification_outbox add column event_details jsonb not null default '{}'::jsonb;
create or replace function public.api_booking_action(p_id uuid,p_action text,p_data jsonb default '{}',p_request uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings; owner boolean=public.is_owner(); amount integer; proposed integer; customer_email text; request_row public.booking_requests; decision text;
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
  if exists(select 1 from public.booking_requests where booking_id=p_id and kind=p_data->>'kind' and not resolved) then raise exception 'This request is already awaiting admin review' using errcode='22023';end if;
  insert into public.booking_requests(booking_id,kind,notes) values(p_id,p_data->>'kind',trim(p_data->>'notes'));
 elsif not owner then raise exception 'Owner access required' using errcode='42501';
 elsif p_action='review_request' then
  select * into request_row from public.booking_requests where id=(p_data->>'request_id')::uuid and booking_id=p_id for update;
  decision=p_data->>'decision';
  if request_row.id is null or coalesce(decision,'') not in('approved','declined') or length(trim(coalesce(p_data->>'notes',''))) not between 1 and 1000 then raise exception 'Choose a request outcome and provide review notes' using errcode='22023';end if;
  if request_row.resolved then
   if request_row.decision=decision then return to_jsonb(b);end if;
   raise exception 'This request has already been reviewed' using errcode='22023';
  end if;
  if decision='approved' then
   if b.status in('completed','cancelled') or b.invoice_issued then raise exception 'This booking can no longer be changed' using errcode='22023';end if;
   if request_row.kind='reschedule' then
    if not coalesce(private.slot_available((p_data->>'date')::date,p_data->>'arrival',p_id),false) then raise exception 'Choose an available date and arrival block' using errcode='22023';end if;
    update public.bookings set visit_date=(p_data->>'date')::date,arrival=p_data->>'arrival' where id=p_id;
   else update public.bookings set status='cancelled' where id=p_id;end if;
  end if;
  update public.booking_requests set resolved=true,decision=p_data->>'decision',review_notes=trim(p_data->>'notes'),decided_at=now() where id=request_row.id;
  perform private.log(p_id,'request_reviewed',jsonb_build_object('request_id',request_row.id,'kind',request_row.kind,'decision',decision,'notes',trim(p_data->>'notes')));
  insert into public.notification_outbox(booking_id,kind,recipient,event_details) values(p_id,case when decision='declined' then 'change_request_declined' when request_row.kind='reschedule' then 'booking_rescheduled' else 'booking_cancelled' end,customer_email,jsonb_build_object('request_kind',request_row.kind,'previous_visit',private.access_visit(b)));
 elsif p_action='external_approval' then
  if b.invoice_issued or b.property->>'source' is distinct from 'owner_manual' or b.quote_status<>'awaiting_approval' or length(trim(coalesce(p_data->>'notes',''))) not between 1 and 2000 then raise exception 'A manual booking awaiting approval and approval notes are required' using errcode='22023'; end if;
  update public.bookings set quote_status='accepted' where id=p_id;
 elsif p_action='approve_booking' then
  if b.status not in('requested','awaiting_walkthrough','confirmed') or not b.reviewed or b.deposit_paid_cents<(b.quote_snapshot->>'deposit_cents')::integer then raise exception 'Deposit and walkthrough review are required before confirming the booking' using errcode='22023';end if;
  if b.property->>'source' is distinct from 'owner_manual' and not exists(select 1 from public.walkthrough_files where booking_id=p_id and status='ready' and purpose='walkthrough') then raise exception 'Customer walkthrough uploads are required before approval' using errcode='22023';end if;
  update public.bookings set walkthrough_approved=true,status='confirmed' where id=p_id;
  if not b.walkthrough_approved then insert into public.notification_outbox(booking_id,kind,recipient) values(p_id,'booking_confirmed',customer_email);end if;
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
  insert into public.notification_outbox(booking_id,kind,recipient) values(p_id,case p_data->>'status' when 'completed' then 'service_completed' when 'cancelled' then 'booking_cancelled' when 'confirmed' then 'booking_confirmed' else 'booking_updated' end,customer_email);
 elsif p_action='reschedule' then
  if b.status in('completed','cancelled') or b.invoice_issued or coalesce(trim(p_data->>'reason'),'')='' or not private.slot_available((p_data->>'date')::date,p_data->>'arrival',p_id) then raise exception 'Choose an available date and provide a reason' using errcode='22023'; end if;
  if b.visit_date is distinct from (p_data->>'date')::date or b.arrival is distinct from p_data->>'arrival' then
  update public.bookings set visit_date=(p_data->>'date')::date,arrival=p_data->>'arrival' where id=p_id;
  insert into public.notification_outbox(booking_id,kind,recipient,event_details) values(p_id,'booking_rescheduled',customer_email,jsonb_build_object('previous_visit',private.access_visit(b)));
  end if;
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
  update public.bookings set invoice_issued=true where id=p_id;
  if not b.invoice_issued then insert into public.notification_outbox(booking_id,kind,recipient) values(p_id,'final_balance_ready',customer_email); end if;
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
 elsif p_action='resolve_request' then raise exception 'Use the request review controls to approve or decline this request' using errcode='22023';
 else raise exception 'Unknown action' using errcode='22023';end if;
 perform private.log(p_id,p_action,p_data);
 return (select to_jsonb(x)-'owner_notes' from public.bookings x where id=p_id);
end $$;
commit;
