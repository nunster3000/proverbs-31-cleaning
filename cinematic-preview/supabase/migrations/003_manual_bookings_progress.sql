-- Manual booking prices and visit progress remain owner-only and audited.
begin;
alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check check(status in('requested','awaiting_walkthrough','confirmed','on_the_way','in_progress','completed','cancelled'));
create or replace function public.api_create_booking(p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.customers; b public.bookings; q jsonb; d date; first_day date=(p_data->>'date')::date; group_key uuid=gen_random_uuid(); recurring jsonb=coalesce(p_data->'recurrence','{"kind":"once"}'); kind text=coalesce(recurring->>'kind','once'); unit text; step integer=1; n integer; count_visits integer=1; result jsonb='[]'; verified boolean=private.account_user(); owner boolean=public.is_owner(); contact_email text; is_guest boolean=coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
begin
 if p_data ? 'manual_price_cents' or p_data ? 'pricing_status' then
  if not owner then raise exception 'Owner access required for manual pricing' using errcode='42501'; end if;
  if coalesce(p_data->>'first_name','')='' or coalesce(p_data->>'last_name','')='' then raise exception 'First and last name are required' using errcode='22023'; end if;
  if coalesce(p_data->>'manual_price_cents','') !~ '^[0-9]{1,8}$' or (p_data->>'manual_price_cents')::integer<=0 then raise exception 'Enter a positive booking price' using errcode='22023'; end if;
  if coalesce(p_data->>'pricing_status','') not in('starting','awaiting_approval','accepted_external') then raise exception 'Choose a pricing status' using errcode='22023'; end if;
  if p_data->>'pricing_status'<>'starting' and length(trim(coalesce(p_data->>'pricing_notes',''))) not between 1 and 2000 then raise exception 'Pricing review or approval notes are required' using errcode='22023'; end if;
 end if;
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform 1 from public.business_settings where id=true for update;
 if is_guest and not(select guest_checkout_enabled from public.business_settings where id=true) then raise exception 'Guest checkout is not enabled' using errcode='42501'; end if;
 if exists(select 1 from public.bookings where creator_id=auth.uid() and request_key=p_request) then return (select jsonb_agg(to_jsonb(x)) from public.bookings x where creator_id=auth.uid() and request_key=p_request); end if;
 if not owner and (select count(*) from public.bookings where creator_id=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception 'Booking limit reached; contact the company' using errcode='22023'; end if;
 if not owner and not is_guest and (auth.jwt()->>'email' is null or nullif(auth.jwt()->>'email','') is null) then raise exception 'Verified email required' using errcode='42501'; end if;
 contact_email=case when not owner and verified then auth.jwt()->>'email' else lower(trim(p_data->>'email')) end;
 if coalesce(trim(p_data->>'name'),'')='' or length(coalesce(contact_email,'')) not between 3 and 254 or contact_email not like '%@%.%' or coalesce(trim(p_data->>'address'),'')='' then raise exception 'Name, email, and address are required' using errcode='22023'; end if;
 if owner and p_data->>'customer_id' is not null then select * into c from public.customers where id=(p_data->>'customer_id')::uuid;if c.id is null then raise exception 'Customer not found' using errcode='22023';end if;elsif not owner then select * into c from public.customers where auth_user_id=auth.uid(); end if;
 if c.id is null then insert into public.customers(auth_user_id,account_enabled,name,email,phone,address,access_notes,pet_notes) values(case when owner then null else auth.uid() end,not owner and verified,trim(p_data->>'name'),contact_email,coalesce(p_data->>'phone',''),p_data->>'address',coalesce(p_data->>'access_notes',''),coalesce(p_data->>'pet_notes','')) returning * into c;
 elsif not owner then update public.customers set account_enabled=verified,email=contact_email,name=trim(p_data->>'name'),phone=coalesce(p_data->>'phone',''),address=p_data->>'address',access_notes=coalesce(p_data->>'access_notes',''),pet_notes=coalesce(p_data->>'pet_notes','') where id=c.id returning * into c; end if;
 q=public.api_quote(p_data->>'service',(p_data->>'space_id')::integer,coalesce(p_data->'focus','[]'),coalesce(p_data->'extras','{}'));
 if owner and p_data ? 'manual_price_cents' then
  q=q||jsonb_build_object('catalog_total_cents',q->'total_cents','source','owner_manual','base_cents',(p_data->>'manual_price_cents')::integer,'total_cents',(p_data->>'manual_price_cents')::integer,'deposit_cents',round((p_data->>'manual_price_cents')::numeric/2)::integer,'addons','[]'::jsonb);
 end if;
 if p_data->>'service'='apartment' and coalesce(p_data->>'apartment_mode','') not in('Move-In','Move-Out') then raise exception 'Choose Move-In or Move-Out' using errcode='22023'; end if;
 if kind<>'once' then count_visits=4; end if;
 if kind='weekly' then unit='weeks'; elsif kind='monthly' then unit='months'; elsif kind='custom' then step=(recurring->>'interval')::integer;unit=recurring->>'unit';if step is null or step not between 1 and 52 or unit not in('days','weeks','months') then raise exception 'Invalid recurrence' using errcode='22023'; end if; elsif kind<>'once' then raise exception 'Invalid recurrence' using errcode='22023'; end if;
 for n in 0..count_visits-1 loop
  d=first_day+case when unit='months' then make_interval(months=>n*step) when unit='weeks' then make_interval(days=>n*step*7) else make_interval(days=>n*step) end;
  if not private.slot_available(d,p_data->>'arrival') then raise exception 'One or more arrival blocks are unavailable' using errcode='P0001'; end if;
  insert into public.bookings(request_key,creator_id,customer_id,property,group_id,service,space_id,apartment_mode,focus,extras,care_notes,quote_snapshot,visit_date,arrival,recurrence) values(p_request,auth.uid(),c.id,jsonb_build_object('name',c.name,'email',c.email,'phone',coalesce(p_data->>'phone',c.phone),'address',p_data->>'address','access_notes',coalesce(p_data->>'access_notes',c.access_notes),'pet_notes',coalesce(p_data->>'pet_notes',c.pet_notes)),group_key,p_data->>'service',(p_data->>'space_id')::integer,case when p_data->>'service'='apartment' then p_data->>'apartment_mode' end,coalesce(p_data->'focus','[]'),coalesce(p_data->'extras','{}'),coalesce(p_data->>'care_notes',''),q,d,p_data->>'arrival',recurring) returning * into b;
  if owner and p_data ? 'manual_price_cents' then
   update public.bookings set property=property||jsonb_build_object('first_name',trim(p_data->>'first_name'),'last_name',trim(p_data->>'last_name'),'source','owner_manual'),reviewed=p_data->>'pricing_status'<>'starting',review_notes=coalesce(p_data->>'pricing_notes',''),quote_status=case p_data->>'pricing_status' when 'accepted_external' then 'accepted' when 'awaiting_approval' then 'awaiting_approval' else 'not_reviewed' end,final_cents=case when p_data->>'pricing_status'<>'starting' then (p_data->>'manual_price_cents')::integer end,revision=case when p_data->>'pricing_status'<>'starting' then 1 else 0 end where id=b.id returning * into b;
   perform private.log(b.id,'manual_pricing_recorded',jsonb_build_object('cents',p_data->'manual_price_cents','status',p_data->>'pricing_status','notes',p_data->>'pricing_notes'));
  end if;
  perform private.log(b.id,'booking_created',jsonb_build_object('source',case when owner then 'owner' else 'customer' end));
  insert into public.notification_outbox(booking_id,kind,recipient) values(b.id,'booking_requested',c.email);
  result=result||jsonb_build_array(to_jsonb(b));
 end loop;return result;
end $$;
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
 elsif p_action='status' then
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
 elsif p_action='notes' then
  if length(coalesce(p_data->>'notes',''))>3000 then raise exception 'Notes too long' using errcode='22023'; end if;insert into public.owner_notes(booking_id,notes) values(p_id,coalesce(p_data->>'notes','')) on conflict(booking_id) do update set notes=excluded.notes;
 elsif p_action='resolve_request' then update public.booking_requests set resolved=true where id=(p_data->>'request_id')::uuid and booking_id=p_id;
 else raise exception 'Unknown action' using errcode='22023';end if;
 perform private.log(p_id,p_action,p_data);
 return (select to_jsonb(x)-'owner_notes' from public.bookings x where id=p_id);
end $$;
commit;
