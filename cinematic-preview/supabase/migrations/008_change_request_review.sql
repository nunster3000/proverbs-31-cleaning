-- Explicit owner decisions; no automatic fees, payment adjustments, or refunds.
begin;
alter table public.booking_requests add column decision text check(decision in('approved','declined')),add column review_notes text not null default '' check(length(review_notes)<=1000),add column decided_at timestamptz;
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
  insert into public.notification_outbox(booking_id,kind,recipient) values(p_id,'booking_updated',customer_email);
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
 elsif p_action='resolve_request' then raise exception 'Use the request review controls to approve or decline this request' using errcode='22023';
 else raise exception 'Unknown action' using errcode='22023';end if;
 perform private.log(p_id,p_action,p_data);
 return (select to_jsonb(x)-'owner_notes' from public.bookings x where id=p_id);
end $$;
create or replace function public.api_owner_attention(p_read_ids uuid[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 if cardinality(p_read_ids)>100 then raise exception 'Too many notices' using errcode='22023';end if;
 insert into private.admin_notice_reads(owner_id,event_id) select auth.uid(),id from public.audit_events where id=any(p_read_ids) and action in('booking_created','accept_quote') on conflict do nothing;
 with candidates as (
  select e.id,e.booking_id,e.created_at,c.name customer_name,b.visit_date,b.service,
   case e.action when 'booking_created' then 'booking' when 'walkthrough_uploaded' then 'walkthrough' else 'approval' end kind,
   row_number() over(partition by e.booking_id,e.action order by e.created_at desc,e.id) rank
  from public.audit_events e join public.bookings b on b.id=e.booking_id join public.customers c on c.id=b.customer_id
  where b.status not in('cancelled','completed') and
   ((e.action='booking_created' and e.details->>'source'='customer' and b.status in('requested','awaiting_walkthrough')) or
    (e.action='walkthrough_uploaded' and not b.reviewed and exists(select 1 from public.walkthrough_files f where f.booking_id=b.id and f.status='ready' and f.purpose='walkthrough')) or
    (e.action='accept_quote' and b.quote_status='accepted'))
 ), notices as(select * from candidates n where rank=1 and not exists(select 1 from private.admin_notice_reads r where r.owner_id=auth.uid() and r.event_id=n.id) union all select r.id,r.booking_id,r.created_at,c.name,b.visit_date,b.service,'change',1::bigint from public.booking_requests r join public.bookings b on b.id=r.booking_id join public.customers c on c.id=b.customer_id where not r.resolved and b.status not in('completed','cancelled'))
 select jsonb_build_object('counts',jsonb_build_object('booking',count(*) filter(where kind='booking'),'walkthrough',count(*) filter(where kind='walkthrough'),'approval',count(*) filter(where kind='approval'),'change',count(*) filter(where kind='change')),'items',coalesce((select jsonb_agg(to_jsonb(x)-'rank'-'category_rank') from (select * from (select notices.*,row_number() over(partition by kind order by created_at desc,id) category_rank from notices) ranked where category_rank<=100 order by created_at desc,id) x),'[]')) into result from notices;
 return result;
end $$;
create or replace function public.api_customer_attention(p_read_ids uuid[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.account_user() then raise exception 'Verified account required' using errcode='42501';end if;
 if cardinality(p_read_ids)>100 then raise exception 'Too many notices' using errcode='22023';end if;
 insert into private.customer_notice_reads(user_id,event_id) select auth.uid(),e.id from public.audit_events e join public.bookings b on b.id=e.booking_id join public.customers c on c.id=b.customer_id where e.id=any(p_read_ids) and e.action in('review','request_reviewed') and c.auth_user_id=auth.uid() and c.account_enabled on conflict do nothing;
 with owned as(select b.* from public.bookings b join public.customers c on c.id=b.customer_id where c.auth_user_id=auth.uid() and c.account_enabled),
 notices as(
  select e.id,b.id booking_id,'review'::text kind,b.service,b.visit_date,e.created_at,null::integer amount_cents from owned b join lateral(select id,created_at from public.audit_events where booking_id=b.id and action='review' order by created_at desc,id limit 1) e on true where b.status<>'cancelled' and b.reviewed and not exists(select 1 from private.customer_notice_reads r where r.user_id=auth.uid() and r.event_id=e.id)
  union all
  select b.id,b.id,'approval',b.service,b.visit_date,b.created_at,b.final_cents from owned b where b.status<>'cancelled' and b.quote_status='awaiting_approval'
  union all
  select b.id,b.id,'payment',b.service,b.visit_date,b.created_at,b.final_cents-b.deposit_paid_cents-b.final_paid_cents from owned b where b.status<>'cancelled' and b.invoice_issued and b.final_cents is not null and b.final_cents>b.deposit_paid_cents+b.final_paid_cents
 union all
  select e.id,b.id,'change',b.service,b.visit_date,e.created_at,null::integer from owned b join public.audit_events e on e.booking_id=b.id and e.action='request_reviewed' where not exists(select 1 from private.customer_notice_reads r where r.user_id=auth.uid() and r.event_id=e.id)
 )
 select jsonb_build_object('counts',jsonb_build_object('review',count(*) filter(where kind='review'),'approval',count(*) filter(where kind='approval'),'payment',count(*) filter(where kind='payment'),'change',count(*) filter(where kind='change')),'items',coalesce((select jsonb_agg(to_jsonb(x)-'category_rank') from(select * from(select notices.*,row_number() over(partition by kind order by created_at desc,id) category_rank from notices) ranked where category_rank<=100) x),'[]')) into result from notices;
 return result;
end $$;
commit;
