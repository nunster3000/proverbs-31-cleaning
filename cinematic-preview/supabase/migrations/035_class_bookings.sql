begin;
insert into public.service_types(id,label,upgrade_cents) values('class','Cleaning Skills & Business Foundations',0);
alter table public.bookings alter column space_id drop not null;
alter table public.bookings add column class_payment_due_at timestamptz;
alter table private.stripe_checkouts drop constraint stripe_checkouts_kind_check,add constraint stripe_checkouts_kind_check check(kind in('deposit','final','full'));
alter table public.payment_records drop constraint payment_records_kind_check,add constraint payment_records_kind_check check(kind in('deposit','final','full'));

alter table public.bookings add constraint booking_space_required check(service='class' or space_id is not null);

-- Share the same calendar lock and reserve the entire slot for a private class.
alter function private.slot_available(date,text,uuid) rename to cleaning_slot_available;
create function private.slot_available(p_date date,p_arrival text,p_ignore uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select private.cleaning_slot_available(p_date,p_arrival,p_ignore) and not exists(select 1 from public.bookings b where b.visit_date=p_date and b.status not in('cancelled','completed') and (p_ignore is null or b.id<>p_ignore) and private.window_start(b.arrival)<private.window_end(p_arrival) and private.window_end(b.arrival)>private.window_start(p_arrival) and (b.service='class' or exists(select 1 from public.bookings x where x.id=p_ignore and x.service='class')))
$$;
create function public.api_class_quote(p_tier text,p_students integer) returns jsonb language plpgsql immutable set search_path='' as $$
declare unit integer;
begin
 unit=case p_tier when 'introductory' then 7500 when 'standard' then 9900 when 'premium' then 12500 end;
 if unit is null or p_students is null or p_students not between 1 and 100 then raise exception 'Choose a class option and between 1 and 100 students' using errcode='22023';end if;
 return jsonb_build_object('service','Cleaning Skills & Business Foundations','space','Private class · '||p_students||' student(s)','tier',p_tier,'students',p_students,'unit_cents',unit,'base_cents',unit*p_students,'total_cents',unit*p_students,'deposit_cents',3000,'duration_minutes',120,'addons','[]'::jsonb);
end$$;
alter function public.api_create_booking(jsonb,uuid) set schema private;
alter function private.api_create_booking(jsonb,uuid) rename to create_cleaning_booking;
revoke all on function private.create_cleaning_booking(jsonb,uuid) from public,anon,authenticated;
create function public.api_create_booking(p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_data->>'service'='class' then raise exception 'Use class enrollment' using errcode='22023';end if;
 return private.create_cleaning_booking(p_data,p_request);
end$$;
create function public.api_create_class_booking(p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;c public.customers;q jsonb;d date;w text;
begin
 if not private.account_user() or not public.customer_account_active() then raise exception 'Register and verify your customer account before booking a class' using errcode='42501';end if;
 if now()<(select opens_at from private.guest_checkout_launch where id) then raise exception 'Class enrollment opens when the website launches' using errcode='42501';end if;
 perform 1 from public.business_settings where id for update;
 if p_request is null then raise exception 'Booking request ID required' using errcode='22023';end if;
 select * into b from public.bookings where creator_id=auth.uid() and request_key=p_request;
 if b.id is not null then if b.service<>'class' then raise exception 'Request already used';end if;return to_jsonb(b);end if;
 if (select count(*) from public.bookings where creator_id=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception 'Booking limit reached; contact Gabrielle';end if;
 if coalesce((p_data->>'consent')::boolean,false)=false then raise exception 'Review and accept your class total' using errcode='22023';end if;
 if length(trim(coalesce(p_data->>'name',''))) not between 1 and 120 or length(coalesce(p_data->>'phone','')) not between 1 and 30 or length(trim(coalesce(p_data->>'location',''))) not between 1 and 600 then raise exception 'Name, phone and class location or delivery preference are required' using errcode='22023';end if;
 q=public.api_class_quote(p_data->>'tier',(p_data->>'students')::integer);d=(p_data->>'date')::date;w=p_data->>'arrival';
 if not private.valid_window(w) then raise exception 'Choose a valid class time';end if;
 if ((d::timestamp+make_interval(mins=>private.window_start(w))) at time zone 'America/New_York')<=now() then raise exception 'Choose a future class time';end if;
 if not coalesce(private.slot_available(d,w),false) or exists(select 1 from public.bookings x where x.visit_date=d and x.status not in('cancelled','completed') and private.window_start(x.arrival)<private.window_end(w) and private.window_end(x.arrival)>private.window_start(w)) then raise exception 'That private class slot is unavailable' using errcode='22023';end if;
 select * into c from public.customers where auth_user_id=auth.uid();
 if c.id is null then insert into public.customers(auth_user_id,account_enabled,name,email,phone) values(auth.uid(),true,trim(p_data->>'name'),auth.jwt()->>'email',p_data->>'phone') returning * into c;end if;
 insert into public.bookings(request_key,creator_id,customer_id,property,group_id,service,quote_snapshot,visit_date,arrival,care_notes,quote_status,final_cents)
 values(p_request,auth.uid(),c.id,jsonb_build_object('name',trim(p_data->>'name'),'email',c.email,'phone',p_data->>'phone','address',trim(p_data->>'location'),'class_location_preference',true),gen_random_uuid(),'class',q,d,w,coalesce(p_data->>'notes',''),'accepted',(q->>'total_cents')::integer) returning * into b;
 perform private.log(b.id,'class_booking_created',jsonb_build_object('students',q->'students','tier',q->'tier','total_cents',q->'total_cents'));
 insert into public.notification_outbox(booking_id,kind,recipient) values(b.id,'booking_requested',c.email);
 return to_jsonb(b);
end$$;
-- Normalize verified deposits without requiring room photos or home-access permission.
create function private.class_booking_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.service='class' then
  new.class_payment_due_at=((new.visit_date::timestamp+make_interval(mins=>private.window_start(new.arrival))) at time zone 'America/New_York')-interval '48 hours';
  if new.quote_snapshot->>'deposit_cents' is distinct from '3000' then raise exception 'Class deposits must be $30';end if;
  if new.access_signed_at is not null then raise exception 'Home-access authorization does not apply to classes';end if;
  if new.status in('requested','awaiting_walkthrough') and new.deposit_paid_cents>=3000 then new.status='confirmed';end if;
 end if;return new;
end$$;
create trigger class_booking_guard before insert or update on public.bookings for each row execute function private.class_booking_guard();
alter function public.api_booking_action(uuid,text,jsonb,uuid) set schema private;
alter function private.api_booking_action(uuid,text,jsonb,uuid) rename to cleaning_booking_action;
revoke all on function private.cleaning_booking_action(uuid,text,jsonb,uuid) from public,anon,authenticated;
create function public.api_booking_action(p_id uuid,p_action text,p_data jsonb default '{}',p_request uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;email text;target text;
begin
 perform 1 from public.business_settings where id for update;
 select * into b from public.bookings where id=p_id for update;
 if p_action='record_payment' and coalesce(p_data->>'kind','') not in('deposit','final') then raise exception 'Choose deposit or final payment';end if;
 if b.service is distinct from 'class' then return private.cleaning_booking_action(p_id,p_action,p_data,p_request);end if;
 if not(public.is_owner() or private.owns_booking(p_id)) then raise exception 'Booking unavailable' using errcode='42501';end if;
 if p_action='record_payment' and b.status='cancelled' then raise exception 'Payment is unavailable for a cancelled class';end if;
 if p_action in('request_change','review_request','reschedule','notes','record_payment') then
  if p_action='record_payment' and not exists(select 1 from public.payment_records where request_key=p_request) and p_data->>'kind'='deposit' and (p_data->>'cents')::integer+b.deposit_paid_cents>3000 then raise exception 'The class deposit is $30';end if;
  return private.cleaning_booking_action(p_id,p_action,p_data,p_request);
 end if;
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 select c.email into email from public.customers c where c.id=b.customer_id;
 if p_action='issue_invoice' then
  if b.status not in('confirmed','in_progress','completed') or b.deposit_paid_cents<3000 or b.final_cents is null or b.quote_status<>'accepted' then raise exception 'A paid deposit and confirmed class are required';end if;
  if b.invoice_issued then return to_jsonb(b);end if;
  update public.bookings set invoice_issued=true where id=p_id;
  insert into public.notification_outbox(booking_id,kind,recipient) values(p_id,'final_balance_ready',email);
 elsif p_action='status' then
  target=p_data->>'status';
  if target='in_progress' and b.deposit_paid_cents+b.final_paid_cents<b.final_cents then raise exception 'Full tuition must be paid before class begins';end if;
  if target=b.status then return to_jsonb(b);end if;
  if target='cancelled' then
   if b.status in('cancelled','completed') or b.invoice_issued or length(trim(coalesce(p_data->>'reason','')))=0 then raise exception 'Provide a cancellation reason; issued balances need separate review';end if;
  elsif not ((target='in_progress' and b.status='confirmed') or (target='completed' and b.status='in_progress')) or b.deposit_paid_cents<3000 then raise exception 'Update class progress in order after the deposit is paid';end if;
  update public.bookings set status=target where id=p_id;
  insert into public.notification_outbox(booking_id,kind,recipient) values(p_id,case target when 'completed' then 'service_completed' when 'cancelled' then 'booking_cancelled' else 'booking_updated' end,email);
 elsif p_action='class_location' then
  if b.status in('cancelled','completed') or length(trim(coalesce(p_data->>'location',''))) not between 1 and 600 then raise exception 'Provide class location or joining instructions';end if;
  update public.bookings set property=property||jsonb_build_object('address',trim(p_data->>'location'),'class_location_preference',false) where id=p_id;
  insert into public.notification_outbox(booking_id,kind,recipient) values(p_id,'booking_updated',email);
 else raise exception 'This action does not apply to class bookings' using errcode='22023';end if;
 perform private.log(p_id,p_action,p_data);
 return (select to_jsonb(x)-'owner_notes' from public.bookings x where id=p_id);
end$$;
revoke all on function private.slot_available(date,text,uuid),private.class_booking_guard() from public,anon,authenticated;
revoke all on function public.api_class_quote(text,integer),public.api_create_class_booking(jsonb,uuid),public.api_create_booking(jsonb,uuid),public.api_booking_action(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.api_class_quote(text,integer) to anon,authenticated;
grant execute on function public.api_create_class_booking(jsonb,uuid),public.api_create_booking(jsonb,uuid),public.api_booking_action(uuid,text,jsonb,uuid) to authenticated;

-- Keep all existing payment checks; only class balances may be issued before completion.
create or replace function public.api_payment_prepare(p_id uuid,p_kind text,p_actor uuid default null,p_guest text default null,p_policy jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;c public.customers;a private.stripe_checkouts;amount integer;pol private.launch_preparation;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 perform 1 from public.business_settings where id=true for update;
 select * into b from public.bookings where id=p_id for update;select * into c from public.customers where id=b.customer_id;
 if b.id is null or not(coalesce(c.auth_user_id=p_actor,false) or (not c.account_enabled and coalesce(b.creator_id=p_actor,false)) or exists(select 1 from private.guest_booking_access g where g.booking_id=p_id and g.session_hash=p_guest and g.revoked_at is null and g.redeemed_at is not null and g.session_expires_at>now() and not c.account_enabled and lower(trim(c.email))=g.recipient_email)) then raise exception 'Booking unavailable' using errcode='42501';end if;
 if b.payment_policy_accepted_at is null then
  select * into pol from private.launch_preparation where id=true;
  if pol.published_revision is null then raise exception 'Online payment is awaiting business policy approval' using errcode='22023';end if;
  if coalesce((p_policy->>'accepted')::boolean,false)=false or (p_policy->>'revision')::integer is distinct from pol.published_revision then raise exception 'Read and acknowledge the current booking policy before payment' using errcode='22023';end if;
  update public.bookings set payment_policy=jsonb_build_object('revision',pol.published_revision,'content',pol.published)||case when b.service='class' then jsonb_build_object('class_terms','A $30 deposit per private class booking is credited toward group tuition. Full tuition is due 48 hours before class starts. Full payment may be made at enrollment.') else '{}'::jsonb end,payment_policy_accepted_at=now() where id=b.id;
 end if;
 if b.status='cancelled' or (p_kind not in('deposit','final','full') or (p_kind='full' and b.service<>'class')) then raise exception 'Payment is unavailable' using errcode='22023';end if;
 if p_kind='final' and (not b.invoice_issued or b.final_cents is null or b.quote_status<>'accepted' or (b.service<>'class' and b.status<>'completed')) then raise exception 'Final balance is not ready' using errcode='22023';end if;
 if b.service='class' and p_kind='deposit' and now()>=b.class_payment_due_at then raise exception 'Full tuition is due 48 hours before class. Choose full payment.' using errcode='22023';end if;
 if b.service='class' and exists(select 1 from private.stripe_checkouts where booking_id=p_id and kind<>p_kind and state in('creating','open') and expires_at>now()) then raise exception 'Another payment option is already open. Finish it or wait for it to expire before switching.' using errcode='22023';end if;
 amount=case when p_kind='deposit' then greatest(0,(b.quote_snapshot->>'deposit_cents')::integer-b.deposit_paid_cents) else greatest(0,b.final_cents-b.deposit_paid_cents-b.final_paid_cents) end;
 if amount<50 then raise exception 'No payable balance remains' using errcode='22023';end if;
 update private.stripe_checkouts set state='expired' where booking_id=p_id and kind=p_kind and state in('creating','open') and expires_at<=now();
 select * into a from private.stripe_checkouts where booking_id=p_id and kind=p_kind and state in('creating','open');
 if a.id is not null and (a.cents<>amount or a.revision<>b.revision) then raise exception 'A payment is already being processed; contact Gabrielle' using errcode='22023';end if;
 if a.id is null then insert into private.stripe_checkouts(booking_id,kind,cents,revision) values(p_id,p_kind,amount,b.revision) returning * into a;end if;
 return to_jsonb(a)||jsonb_build_object('email',c.email,'service',b.quote_snapshot->>'service');
end $$;


create function public.api_class_availability(p_start date,p_days integer default 31) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare days jsonb;day jsonb;slot jsonb;result jsonb='[]';slots jsonb;
begin
 days=public.api_availability(p_start,p_days);
 for day in select value from jsonb_array_elements(days) loop
  slots='[]';for slot in select value from jsonb_array_elements(day->'slots') loop
   slots=slots||jsonb_build_array(slot||jsonb_build_object('available',(slot->>'available')::boolean and (((day->>'date')::date::timestamp+make_interval(mins=>private.window_start(slot->>'id'))) at time zone 'America/New_York')>now() and not exists(select 1 from public.bookings b where b.visit_date=(day->>'date')::date and b.status not in('cancelled','completed') and private.window_start(b.arrival)<private.window_end(slot->>'id') and private.window_end(b.arrival)>private.window_start(slot->>'id'))));
  end loop;result=result||jsonb_build_array(jsonb_build_object('date',day->>'date','slots',slots));
 end loop;return result;
end$$;
revoke all on function public.api_class_availability(date,integer) from public;
grant execute on function public.api_class_availability(date,integer) to anon,authenticated;
create function private.no_class_walkthrough() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.bookings where id=new.booking_id and service='class') then raise exception 'Classes do not require walkthrough uploads';end if;return new;
end$$;
create trigger no_class_walkthrough before insert on public.walkthrough_files for each row execute function private.no_class_walkthrough();
revoke all on function private.no_class_walkthrough() from public,anon,authenticated;
create or replace function public.api_customer_attention(p_read_ids uuid[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.account_user() then raise exception 'Verified account required' using errcode='42501';end if;
 if cardinality(p_read_ids)>100 then raise exception 'Too many notices' using errcode='22023';end if;
 insert into private.customer_notice_reads(user_id,event_id) select auth.uid(),e.id from public.audit_events e join public.bookings b on b.id=e.booking_id join public.customers c on c.id=b.customer_id where e.id=any(p_read_ids) and e.action in('review','request_reviewed') and c.auth_user_id=auth.uid() and c.account_enabled on conflict do nothing;
 with owned as(select b.* from public.bookings b join public.customers c on c.id=b.customer_id where c.auth_user_id=auth.uid() and c.account_enabled),
 notices as(
 select b.id,b.id booking_id,'access'::text kind,b.service,b.visit_date,b.created_at,null::integer amount_cents from owned b where b.service<>'class' and b.status='confirmed' and b.access_signed_at is null
 union all
  select e.id,b.id booking_id,'review'::text kind,b.service,b.visit_date,e.created_at,null::integer amount_cents from owned b join lateral(select id,created_at from public.audit_events where booking_id=b.id and action='review' order by created_at desc,id limit 1) e on true where b.status<>'cancelled' and b.reviewed and not exists(select 1 from private.customer_notice_reads r where r.user_id=auth.uid() and r.event_id=e.id)
  union all
  select b.id,b.id,'approval',b.service,b.visit_date,b.created_at,b.final_cents from owned b where b.status<>'cancelled' and b.quote_status='awaiting_approval'
  union all
  select b.id,b.id,'payment',b.service,b.visit_date,b.created_at,b.final_cents-b.deposit_paid_cents-b.final_paid_cents from owned b where b.status<>'cancelled' and b.invoice_issued and b.final_cents is not null and b.final_cents>b.deposit_paid_cents+b.final_paid_cents
 union all
  select e.id,b.id,'change',b.service,b.visit_date,e.created_at,null::integer from owned b join public.audit_events e on e.booking_id=b.id and e.action='request_reviewed' where not exists(select 1 from private.customer_notice_reads r where r.user_id=auth.uid() and r.event_id=e.id)
 )
 select jsonb_build_object('counts',jsonb_build_object('access',count(*) filter(where kind='access'),'review',count(*) filter(where kind='review'),'approval',count(*) filter(where kind='approval'),'payment',count(*) filter(where kind='payment'),'change',count(*) filter(where kind='change')),'items',coalesce((select jsonb_agg(to_jsonb(x)-'category_rank') from(select * from(select notices.*,row_number() over(partition by kind order by created_at desc,id) category_rank from notices) ranked where category_rank<=100) x),'[]')) into result from notices;
 return result;
end $$;
create or replace function public.api_payment_settle(p_attempt uuid,p_session text,p_intent text,p_event text,p_cents integer,p_currency text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.stripe_checkouts;b public.bookings;amount integer;email text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 perform 1 from public.business_settings where id=true for update;
 select * into a from private.stripe_checkouts where id=p_attempt;
 select * into b from public.bookings where id=a.booking_id for update;
 select * into a from private.stripe_checkouts where id=p_attempt for update;
 if a.id is null or a.session_id is distinct from p_session or a.cents is distinct from p_cents or a.currency is distinct from p_currency or coalesce(p_intent,'') !~ '^pi_[A-Za-z0-9]+$' then raise exception 'Payment does not match checkout';end if;
 if exists(select 1 from private.stripe_events where id=p_event) or a.state in('paid','review') then return jsonb_build_object('state',a.state);end if;
 insert into private.stripe_events(id,attempt_id) values(p_event,p_attempt);
 amount=case when a.kind='deposit' then (b.quote_snapshot->>'deposit_cents')::integer-b.deposit_paid_cents else coalesce(b.final_cents,0)-b.deposit_paid_cents-b.final_paid_cents end;
 if b.status='cancelled' or amount<>p_cents or ((a.kind='final' and not b.invoice_issued) or (a.kind in('final','full') and (b.revision<>a.revision or b.quote_status<>'accepted'))) then
  update private.stripe_checkouts set state='review',payment_intent=p_intent where id=a.id;
  insert into public.audit_events(booking_id,action,details) values(b.id,'stripe_payment_needs_review',jsonb_build_object('attempt',a.id,'cents',p_cents,'payment_intent',p_intent));return jsonb_build_object('state','review');
 end if;
 insert into public.payment_records(request_key,booking_id,kind,cents,method,provider,provider_reference) values(a.id,b.id,a.kind,p_cents,'Stripe Checkout','stripe',p_intent);
 update public.bookings set deposit_paid_cents=deposit_paid_cents+case when a.kind='deposit' then p_cents when a.kind='full' then greatest(0,3000-b.deposit_paid_cents) else 0 end,final_paid_cents=final_paid_cents+case when a.kind='final' then p_cents when a.kind='full' then p_cents-greatest(0,3000-b.deposit_paid_cents) else 0 end,invoice_issued=invoice_issued or a.kind='full' where id=b.id;
 update public.bookings set status='awaiting_walkthrough' where id=b.id and status='requested' and deposit_paid_cents>=(quote_snapshot->>'deposit_cents')::integer;
 update private.stripe_checkouts set state='paid',payment_intent=p_intent where id=a.id;
 select c.email into email from public.customers c where c.id=b.customer_id;
 insert into public.notification_outbox(booking_id,kind,recipient,event_details) values(b.id,'payment_received',email,jsonb_build_object('payment_kind',a.kind,'cents',p_cents));
 insert into public.audit_events(booking_id,action,details) values(b.id,'stripe_payment_received',jsonb_build_object('kind',a.kind,'cents',p_cents,'payment_intent',p_intent));
 return jsonb_build_object('state','paid');
end $$;

create or replace function private.enforce_access_authorization() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.service='class' then return new;end if;
 if private.access_visit(new) is distinct from private.access_visit(old) then new.access_signed_at=null;end if;
 if new.status='confirmed' and new.access_form_id is null then select id into new.access_form_id from public.access_forms where active;end if;
 if new.status='on_the_way' and old.status<>'on_the_way' and (new.access_signed_at is null or not exists(select 1 from public.access_signatures s where s.booking_id=new.id and s.form_id=new.access_form_id and s.visit_snapshot=private.access_visit(new))) then raise exception 'Customer home-access authorization must be signed before On the way' using errcode='22023';end if;
 return new;
end $$;
commit;
