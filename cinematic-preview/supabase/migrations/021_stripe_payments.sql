begin;
alter table public.bookings add column payment_policy jsonb,add column payment_policy_accepted_at timestamptz;
create table private.stripe_checkouts(
 id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),kind text not null check(kind in('deposit','final')),
 cents integer not null check(cents>=50),currency text not null default 'usd',revision integer not null,
 state text not null default 'creating' check(state in('creating','open','paid','expired','review')),
 session_id text unique,checkout_url text,payment_intent text unique,expires_at timestamptz not null default now()+interval '1 hour',created_at timestamptz not null default now());
create unique index stripe_active_checkout on private.stripe_checkouts(booking_id,kind) where state in('creating','open');
create table private.stripe_events(id text primary key,attempt_id uuid references private.stripe_checkouts(id),created_at timestamptz not null default now());
alter table public.payment_records alter column recorded_by drop not null;
alter table public.payment_records add column provider text not null default 'manual' check(provider in('manual','stripe')),add column provider_reference text unique;
create function public.api_payment_prepare(p_id uuid,p_kind text,p_actor uuid default null,p_guest text default null,p_policy jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
  update public.bookings set payment_policy=jsonb_build_object('revision',pol.published_revision,'content',pol.published),payment_policy_accepted_at=now() where id=b.id;
 end if;
 if b.status='cancelled' or p_kind not in('deposit','final') then raise exception 'Payment is unavailable' using errcode='22023';end if;
 if p_kind='final' and (not b.invoice_issued or b.final_cents is null or b.quote_status<>'accepted' or b.status<>'completed') then raise exception 'Final balance is not ready' using errcode='22023';end if;
 amount=case when p_kind='deposit' then greatest(0,(b.quote_snapshot->>'deposit_cents')::integer-b.deposit_paid_cents) else greatest(0,b.final_cents-b.deposit_paid_cents-b.final_paid_cents) end;
 if amount<50 then raise exception 'No payable balance remains' using errcode='22023';end if;
 update private.stripe_checkouts set state='expired' where booking_id=p_id and kind=p_kind and state in('creating','open') and expires_at<=now();
 select * into a from private.stripe_checkouts where booking_id=p_id and kind=p_kind and state in('creating','open');
 if a.id is not null and (a.cents<>amount or a.revision<>b.revision) then raise exception 'A payment is already being processed; contact Gabrielle' using errcode='22023';end if;
 if a.id is null then insert into private.stripe_checkouts(booking_id,kind,cents,revision) values(p_id,p_kind,amount,b.revision) returning * into a;end if;
 return to_jsonb(a)||jsonb_build_object('email',c.email,'service',b.quote_snapshot->>'service');
end $$;
create function public.api_payment_attach(p_attempt uuid,p_session text,p_url text,p_expires timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.stripe_checkouts;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 if p_session !~ '^cs_(test_|live_)?[A-Za-z0-9]+$' or p_url !~ '^https://checkout\.stripe\.com/' then raise exception 'Invalid payment destination';end if;
 select * into a from private.stripe_checkouts where id=p_attempt for update;
 if a.id is null or (a.session_id is not null and a.session_id<>p_session) then raise exception 'Checkout changed';end if;
 update private.stripe_checkouts set session_id=p_session,checkout_url=p_url,expires_at=p_expires,state=case when state='creating' then 'open' else state end where id=p_attempt returning * into a;return to_jsonb(a);
end $$;
create function public.api_payment_settle(p_attempt uuid,p_session text,p_intent text,p_event text,p_cents integer,p_currency text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if b.status='cancelled' or amount<>p_cents or (a.kind='final' and (not b.invoice_issued or b.revision<>a.revision or b.quote_status<>'accepted')) then
  update private.stripe_checkouts set state='review',payment_intent=p_intent where id=a.id;
  insert into public.audit_events(booking_id,action,details) values(b.id,'stripe_payment_needs_review',jsonb_build_object('attempt',a.id,'cents',p_cents,'payment_intent',p_intent));return jsonb_build_object('state','review');
 end if;
 insert into public.payment_records(request_key,booking_id,kind,cents,method,provider,provider_reference) values(a.id,b.id,a.kind,p_cents,'Stripe Checkout','stripe',p_intent);
 update public.bookings set deposit_paid_cents=deposit_paid_cents+case when a.kind='deposit' then p_cents else 0 end,final_paid_cents=final_paid_cents+case when a.kind='final' then p_cents else 0 end where id=b.id;
 update public.bookings set status='awaiting_walkthrough' where id=b.id and status='requested' and deposit_paid_cents>=(quote_snapshot->>'deposit_cents')::integer;
 update private.stripe_checkouts set state='paid',payment_intent=p_intent where id=a.id;
 select c.email into email from public.customers c where c.id=b.customer_id;
 insert into public.notification_outbox(booking_id,kind,recipient,event_details) values(b.id,'payment_received',email,jsonb_build_object('payment_kind',a.kind,'cents',p_cents));
 insert into public.audit_events(booking_id,action,details) values(b.id,'stripe_payment_received',jsonb_build_object('kind',a.kind,'cents',p_cents,'payment_intent',p_intent));
 return jsonb_build_object('state','paid');
end $$;
create function public.api_payment_reviews() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('booking_id',booking_id,'cents',cents,'kind',kind,'payment_intent',payment_intent)) from private.stripe_checkouts where state='review'),'[]'::jsonb);
end $$;
-- An owner must not manually record a second payment while a checkout can still be paid.
create function private.payment_manual_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.provider='manual' and exists(select 1 from private.stripe_checkouts where booking_id=new.booking_id and state in('creating','open') and expires_at>now()) then raise exception 'Online checkout is open. Wait for it to finish or expire before recording another payment.' using errcode='22023';end if;return new;
end $$;
create trigger payment_manual_guard before insert on public.payment_records for each row execute function private.payment_manual_guard();
revoke all on function public.api_payment_prepare(uuid,text,uuid,text,jsonb),public.api_payment_attach(uuid,text,text,timestamptz),public.api_payment_settle(uuid,text,text,text,integer,text),public.api_payment_reviews() from public,anon,authenticated;
grant execute on function public.api_payment_prepare(uuid,text,uuid,text,jsonb),public.api_payment_attach(uuid,text,text,timestamptz),public.api_payment_settle(uuid,text,text,text,integer,text) to service_role;
grant execute on function public.api_payment_reviews() to authenticated;
commit;
