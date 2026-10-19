begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.owner_accounts(user_id uuid primary key references auth.users(id) on delete cascade);
create function public.is_owner() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from private.owner_accounts where user_id=auth.uid()) $$;
create function private.account_user() returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) $$;
create table public.service_spaces(id integer primary key,label text not null,base_cents integer not null check(base_cents>0),suite boolean not null default false);
insert into public.service_spaces values(0,'King guest suite · bedroom + bathroom',6500,true),(1,'Queen guest suite · bedroom + bathroom',5000,true),(2,'Studio Apartment',8500,false),(3,'1 Bedroom / 1 Bathroom',11000,false),(4,'2 Bedrooms / 1–2 Bathrooms',14000,false),(5,'3 Bedrooms / 2 Bathrooms',17500,false),(6,'4 Bedrooms / 2–3 Bathrooms',22500,false),(7,'Large / Entire Home',25000,false);
create table public.service_types(id text primary key,label text not null,upgrade_cents integer not null default 0);
insert into public.service_types values('standard','Standard Cleaning',0),('deep','Deep Cleaning',10000),('apartment','Apartment Cleaning',0),('airbnb','Airbnb Turnover',0);
create table public.service_addons(id text primary key,label text not null,cents integer not null check(cents>0),per_load boolean default false);
insert into public.service_addons values('laundry','Laundry service',2000,true),('fridge','Refrigerator cleaning',7500,false),('oven','Stove / oven cleaning',8500,false),('baseboards','Baseboard cleaning',4500,false);
create table public.business_settings(id boolean primary key default true check(id),timezone text not null default 'America/New_York',working_days integer[] not null default array[1,2,3,4,5,6],windows text[] not null default array['morning','afternoon'],capacity integer not null default 1 check(capacity between 1 and 10),max_advance_days integer not null default 365 check(max_advance_days between 1 and 730),guest_checkout_enabled boolean not null default false,check(array_length(working_days,1)>0),check(array_length(windows,1)>0));
insert into public.business_settings(id) values(true);
create function private.window_start(p text) returns integer language sql immutable set search_path='' as $$select case when p='morning' then 540 when p='afternoon' then 720 else split_part(split_part(p,'-',1),':',1)::integer*60+split_part(split_part(p,'-',1),':',2)::integer end$$;
create function private.window_end(p text) returns integer language sql immutable set search_path='' as $$select case when p='morning' then 720 when p='afternoon' then 900 else split_part(split_part(p,'-',2),':',1)::integer*60+split_part(split_part(p,'-',2),':',2)::integer end$$;
create function private.valid_window(p text) returns boolean language plpgsql immutable set search_path='' as $$begin if p is null then return false;end if;if p in('morning','afternoon') then return true;end if;if p !~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$' then return false;end if;return private.window_end(p)-private.window_start(p) in(120,180);end$$;
create table public.calendar_days(visit_date date primary key,windows text[] not null);
create table public.customers(id uuid primary key default gen_random_uuid(),auth_user_id uuid unique references auth.users(id) on delete set null,account_enabled boolean not null default false,name text not null check(length(name) between 1 and 120),email text not null check(length(email)<=254),phone text not null default '' check(length(phone)<=30),address text not null default '' check(length(address)<=600),access_notes text not null default '' check(length(access_notes)<=1000),pet_notes text not null default '' check(length(pet_notes)<=1000),created_at timestamptz not null default now());
create index customers_email_idx on public.customers(lower(email));
create table public.bookings(id uuid primary key default gen_random_uuid(),request_key uuid not null,creator_id uuid references auth.users(id),customer_id uuid not null references public.customers(id),property jsonb not null,group_id uuid not null,service text not null references public.service_types(id),space_id integer not null references public.service_spaces(id),apartment_mode text check(apartment_mode in('Move-In','Move-Out')),focus jsonb not null default '[]',extras jsonb not null default '{}',care_notes text not null default '' check(length(care_notes)<=2000),quote_snapshot jsonb not null,visit_date date not null,arrival text not null check(private.valid_window(arrival)),recurrence jsonb not null default '{"kind":"once"}',status text not null default 'requested' check(status in('requested','awaiting_walkthrough','confirmed','completed','cancelled')),reviewed boolean not null default false,review_notes text not null default '',owner_notes text not null default '',quote_status text not null default 'not_reviewed' check(quote_status in('not_reviewed','awaiting_approval','accepted')),revision integer not null default 0,final_cents integer check(final_cents>=0),deposit_paid_cents integer not null default 0 check(deposit_paid_cents>=0),final_paid_cents integer not null default 0 check(final_paid_cents>=0),invoice_issued boolean not null default false,created_at timestamptz not null default now(),unique(creator_id,request_key,visit_date));
create index bookings_customer_idx on public.bookings(customer_id);
create index bookings_slot_idx on public.bookings(visit_date,arrival) where status not in('cancelled','completed');
create table public.time_blocks(id uuid primary key default gen_random_uuid(),visit_date date not null,arrival text check(arrival is null or private.valid_window(arrival)),start_time time,end_time time,check((start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time>start_time and arrival is null)),reason text not null check(length(reason) between 1 and 200));
create table public.quote_adjustments(id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),label text not null check(length(label) between 1 and 150),cents integer not null check(cents<>0 and abs(cents)<=1000000),created_at timestamptz not null default now());
create table public.payment_records(id uuid primary key default gen_random_uuid(),request_key uuid not null unique,booking_id uuid not null references public.bookings(id),kind text not null check(kind in('deposit','final')),cents integer not null check(cents>0),method text not null check(length(method) between 1 and 100),recorded_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.booking_requests(id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),kind text not null check(kind in('reschedule','cancel')),notes text not null check(length(notes) between 1 and 1000),resolved boolean not null default false,created_at timestamptz not null default now());
create table public.walkthrough_files(id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),uploader_id uuid not null references auth.users(id),path text unique not null,filename text not null check(length(filename) between 1 and 200),mime text not null check(mime in('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime')),bytes bigint not null check(bytes between 1 and 20971520),room text not null check(length(room) between 1 and 100),notes text not null default '' check(length(notes)<=2000),status text not null default 'pending' check(status in('pending','ready','deleted')),created_at timestamptz not null default now());
create table public.audit_events(id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id),booking_id uuid references public.bookings(id),action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create table public.notification_outbox(id uuid primary key default gen_random_uuid(),booking_id uuid references public.bookings(id),kind text not null,recipient text not null,status text not null default 'pending_provider' check(status in('pending_provider','sent','failed')),created_at timestamptz not null default now());
create function private.owns_booking(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.account_user() and exists(select 1 from public.bookings b join public.customers c on c.id=b.customer_id where b.id=p_id and c.auth_user_id=auth.uid()) $$;
create function private.log(p_id uuid,p_action text,p_details jsonb default '{}') returns void language sql security definer set search_path='' as $$ insert into public.audit_events(actor_id,booking_id,action,details) values(auth.uid(),p_id,p_action,p_details) $$;
create function public.api_quote(p_service text,p_space integer,p_focus jsonb default '[]',p_extras jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.service_spaces; t public.service_types; a public.service_addons; base integer; total integer; qty integer; included boolean; lines jsonb='[]';
begin
 select * into s from public.service_spaces where id=p_space; select * into t from public.service_types where id=p_service;
 if s.id is null or t.id is null or s.suite<>(p_service='airbnb') then raise exception 'Invalid service or property size' using errcode='22023'; end if;
 if jsonb_typeof(p_focus)<>'array' or jsonb_array_length(p_focus)>20 or jsonb_typeof(p_extras)<>'object' then raise exception 'Invalid room focus or extras' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_focus) v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>100) then raise exception 'Invalid room name' using errcode='22023'; end if;
 base=s.base_cents+t.upgrade_cents; total=base;
 for a in select * from public.service_addons order by id loop
  if a.per_load then qty=coalesce((p_extras->>a.id)::integer,0); if qty not between 0 and 20 then raise exception 'Laundry must be 0 to 20 loads' using errcode='22023'; end if;
  else qty=case when coalesce((p_extras->>a.id)::boolean,false) then 1 else 0 end; end if;
  included=p_service='deep' and (a.id='baseboards' or (a.id in('fridge','oven') and p_focus ? 'Kitchen'));
  if qty>0 or included then lines=lines||jsonb_build_array(jsonb_build_object('id',a.id,'label',a.label,'quantity',qty,'included',included,'unit_cents',a.cents,'amount_cents',case when included then 0 else qty*a.cents end)); end if;
  if not included then total=total+qty*a.cents; end if;
 end loop;
 return jsonb_build_object('service',t.label,'space',s.label,'base_cents',base,'total_cents',total,'deposit_cents',round(base::numeric/2)::integer,'addons',lines);
end $$;
create function private.slot_available(p_date date,p_arrival text,p_ignore uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select private.valid_window(p_arrival) and p_arrival=any(coalesce(c.windows,s.windows)) and (c.visit_date is not null or extract(dow from p_date)::integer=any(s.working_days))
 and p_date >= (now() at time zone s.timezone)::date and p_date <= (now() at time zone s.timezone)::date+s.max_advance_days
 and not exists(select 1 from public.time_blocks x where x.visit_date=p_date and (case when x.start_time is not null then extract(epoch from x.start_time)/60 < private.window_end(p_arrival) and extract(epoch from x.end_time)/60 > private.window_start(p_arrival) else x.arrival is null or (private.window_start(x.arrival)<private.window_end(p_arrival) and private.window_end(x.arrival)>private.window_start(p_arrival)) end))
 and (select count(*) from public.bookings b where b.visit_date=p_date and private.window_start(b.arrival)<private.window_end(p_arrival) and private.window_end(b.arrival)>private.window_start(p_arrival) and b.status not in('cancelled','completed') and (p_ignore is null or b.id<>p_ignore))<s.capacity from public.business_settings s left join public.calendar_days c on c.visit_date=p_date where s.id=true
$$;
create function public.api_availability(p_start date,p_days integer default 31) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_days not between 1 and 62 then raise exception 'Invalid date range' using errcode='22023'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('date',d::date,'morning',private.slot_available(d::date,'morning'),'afternoon',private.slot_available(d::date,'afternoon'),'slots',(select coalesce(jsonb_agg(jsonb_build_object('id',w,'available',private.slot_available(d::date,w))),'[]') from unnest(coalesce((select windows from public.calendar_days where visit_date=d::date),(select windows from public.business_settings where id=true))) w))),'[]') from generate_series(p_start,p_start+p_days-1,interval '1 day') d);
end $$;
create function public.api_create_booking(p_data jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.customers; b public.bookings; q jsonb; d date; first_day date=(p_data->>'date')::date; group_key uuid=gen_random_uuid(); recurring jsonb=coalesce(p_data->'recurrence','{"kind":"once"}'); kind text=coalesce(recurring->>'kind','once'); unit text; step integer=1; n integer; count_visits integer=1; result jsonb='[]'; verified boolean=private.account_user(); owner boolean=public.is_owner(); contact_email text; is_guest boolean=coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
begin
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
 if p_data->>'service'='apartment' and coalesce(p_data->>'apartment_mode','') not in('Move-In','Move-Out') then raise exception 'Choose Move-In or Move-Out' using errcode='22023'; end if;
 if kind<>'once' then count_visits=4; end if;
 if kind='weekly' then unit='weeks'; elsif kind='monthly' then unit='months'; elsif kind='custom' then step=(recurring->>'interval')::integer;unit=recurring->>'unit';if step is null or step not between 1 and 52 or unit not in('days','weeks','months') then raise exception 'Invalid recurrence' using errcode='22023'; end if; elsif kind<>'once' then raise exception 'Invalid recurrence' using errcode='22023'; end if;
 for n in 0..count_visits-1 loop
  d=first_day+case when unit='months' then make_interval(months=>n*step) when unit='weeks' then make_interval(days=>n*step*7) else make_interval(days=>n*step) end;
  if not private.slot_available(d,p_data->>'arrival') then raise exception 'One or more arrival blocks are unavailable' using errcode='P0001'; end if;
  insert into public.bookings(request_key,creator_id,customer_id,property,group_id,service,space_id,apartment_mode,focus,extras,care_notes,quote_snapshot,visit_date,arrival,recurrence) values(p_request,auth.uid(),c.id,jsonb_build_object('name',c.name,'email',c.email,'phone',coalesce(p_data->>'phone',c.phone),'address',p_data->>'address','access_notes',coalesce(p_data->>'access_notes',c.access_notes),'pet_notes',coalesce(p_data->>'pet_notes',c.pet_notes)),group_key,p_data->>'service',(p_data->>'space_id')::integer,case when p_data->>'service'='apartment' then p_data->>'apartment_mode' end,coalesce(p_data->'focus','[]'),coalesce(p_data->'extras','{}'),coalesce(p_data->>'care_notes',''),q,d,p_data->>'arrival',recurring) returning * into b;
  perform private.log(b.id,'booking_created',jsonb_build_object('source',case when owner then 'owner' else 'customer' end));
  insert into public.notification_outbox(booking_id,kind,recipient) values(b.id,'booking_requested',c.email);
  result=result||jsonb_build_array(to_jsonb(b));
 end loop;return result;
end $$;
create function public.api_booking_action(p_id uuid,p_action text,p_data jsonb default '{}',p_request uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
 elsif p_action='status' then
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
create table public.owner_notes(booking_id uuid primary key references public.bookings(id),notes text not null check(length(notes)<=3000));
alter table public.bookings drop column owner_notes;
-- Keep internal notes out of customer-readable booking rows.
create function public.api_save_owner_notes(p_id uuid,p_notes text) returns void language plpgsql security definer set search_path='' as $$ begin if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;insert into public.owner_notes values(p_id,p_notes) on conflict(booking_id) do update set notes=excluded.notes;perform private.log(p_id,'owner_notes_updated');end $$;
create function public.api_profile(p_data jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.customers;
begin if not private.account_user() then raise exception 'Verified sign-in required' using errcode='42501';end if;
 if p_data is not null then
 insert into public.customers(auth_user_id,account_enabled,name,email,phone,address,access_notes,pet_notes) values(auth.uid(),true,trim(p_data->>'name'),auth.jwt()->>'email',coalesce(p_data->>'phone',''),coalesce(p_data->>'address',''),coalesce(p_data->>'access_notes',''),coalesce(p_data->>'pet_notes','')) on conflict(auth_user_id) do update set account_enabled=true,email=excluded.email,name=excluded.name,phone=excluded.phone,address=excluded.address,access_notes=excluded.access_notes,pet_notes=excluded.pet_notes;
 end if;update public.customers set email=auth.jwt()->>'email' where auth_user_id=auth.uid();select * into c from public.customers where auth_user_id=auth.uid();return to_jsonb(c);
end $$;
create function public.api_owner_schedule(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare days integer[]; windows text[]; first_day date; last_day date; start_at time; end_at time;
begin if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;perform 1 from public.business_settings where id=true for update;
 if p_action='settings' then
  select array_agg(value::integer) into days from jsonb_array_elements_text(p_data->'days');select array_agg(value) into windows from jsonb_array_elements_text(p_data->'windows');
  if coalesce(array_length(days,1),0)=0 or not days<@array[0,1,2,3,4,5,6] or coalesce(array_length(windows,1),0)=0 or exists(select 1 from unnest(windows) w where not private.valid_window(w)) or exists(select 1 from unnest(windows) with ordinality a(w,i),unnest(windows) with ordinality b(w,i) where a.i<b.i and private.window_start(a.w)<private.window_end(b.w) and private.window_end(a.w)>private.window_start(b.w)) then raise exception 'Choose working days and nonoverlapping 2-hour or 3-hour windows' using errcode='22023';end if;
  update public.business_settings set working_days=days,windows=windows,capacity=(p_data->>'capacity')::integer where id=true;
 elsif p_action='day_windows' then
  first_day=(p_data->>'date')::date;
  select coalesce(array_agg(value),'{}'::text[]) into windows from jsonb_array_elements_text(p_data->'windows');
  if first_day is null or jsonb_typeof(p_data->'windows') is distinct from 'array' or cardinality(windows)>12 or exists(select 1 from unnest(windows) w where not private.valid_window(w)) or exists(select 1 from unnest(windows) with ordinality a(w,i),unnest(windows) with ordinality b(w,i) where a.i<b.i and private.window_start(a.w)<private.window_end(b.w) and private.window_end(a.w)>private.window_start(b.w)) then raise exception 'Choose valid nonoverlapping 2-hour or 3-hour blocks' using errcode='22023';end if;
  insert into public.calendar_days(visit_date,windows) values(first_day,windows) on conflict(visit_date) do update set windows=excluded.windows;
 elsif p_action='block' then
  first_day=(p_data->>'date')::date;last_day=coalesce(nullif(p_data->>'through','')::date,first_day);
  start_at=nullif(p_data->>'start_time','')::time;end_at=nullif(p_data->>'end_time','')::time;
  if first_day is null or last_day<first_day or last_day-first_day>365 or (start_at is null)<>(end_at is null) or (start_at is not null and (end_at<=start_at or p_data->>'arrival' is not null)) or coalesce(trim(p_data->>'reason'),'')='' then raise exception 'Choose valid dates, hours, and a reason' using errcode='22023';end if;
  if exists(select 1 from public.bookings b where b.visit_date between first_day and last_day and b.status not in('cancelled','completed') and (case when start_at is not null then extract(epoch from start_at)/60 < private.window_end(b.arrival) and extract(epoch from end_at)/60 > private.window_start(b.arrival) else p_data->>'arrival' is null or (private.window_start(b.arrival)<private.window_end(p_data->>'arrival') and private.window_end(b.arrival)>private.window_start(p_data->>'arrival')) end)) then raise exception 'Move existing bookings before blocking this range. Nothing was changed' using errcode='22023';end if;
  insert into public.time_blocks(visit_date,arrival,start_time,end_time,reason) select d::date,p_data->>'arrival',start_at,end_at,trim(p_data->>'reason') from generate_series(first_day,last_day,interval '1 day') d;
 elsif p_action='unblock' then delete from public.time_blocks where id=(p_data->>'id')::uuid;
 else raise exception 'Unknown schedule action' using errcode='22023';end if;
 perform private.log(null,'schedule_'||p_action,p_data);return jsonb_build_object('saved',true);
end $$;
create function public.api_upload_request(p_id uuid,p_file jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.walkthrough_files;b public.bookings;key uuid=gen_random_uuid();
begin select * into b from public.bookings where id=p_id for update;if not(public.is_owner() or private.owns_booking(p_id)) or b.id is null or b.invoice_issued or b.status in('cancelled','completed') then raise exception 'Walkthrough upload unavailable' using errcode='42501';end if;
 if(select count(*) from public.walkthrough_files where booking_id=p_id and status<>'deleted')>=6 or coalesce((select sum(bytes) from public.walkthrough_files where booking_id=p_id and status<>'deleted'),0)+(p_file->>'bytes')::bigint>83886080 then raise exception 'Walkthrough file limit reached' using errcode='22023';end if;
 insert into public.walkthrough_files(id,booking_id,uploader_id,path,filename,mime,bytes,room,notes) values(key,p_id,auth.uid(),p_id::text||'/'||key::text,p_file->>'filename',p_file->>'mime',(p_file->>'bytes')::bigint,trim(p_file->>'room'),coalesce(p_file->>'notes','')) returning * into f;return to_jsonb(f);
end $$;
create function public.api_upload_finish(p_file uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.walkthrough_files;b public.bookings;
begin select * into f from public.walkthrough_files where id=p_file;select * into b from public.bookings where id=f.booking_id for update;
 if f.id is null or not(exists(select 1 from private.owner_accounts where user_id=p_actor) or exists(select 1 from public.customers where id=b.customer_id and auth_user_id=p_actor)) or b.invoice_issued or b.status in('cancelled','completed') then raise exception 'File unavailable' using errcode='42501';end if;
 if not exists(select 1 from storage.objects o where bucket_id='walkthroughs' and name=f.path and (metadata->>'size')::bigint=f.bytes and metadata->>'mimetype'=f.mime) then raise exception 'Uploaded file does not match its reservation' using errcode='22023';end if;
 update public.walkthrough_files set status='ready' where id=f.id;update public.bookings set reviewed=false,quote_status='not_reviewed',final_cents=null,revision=revision+1 where id=f.booking_id;
 insert into public.audit_events(actor_id,booking_id,action,details) values(p_actor,f.booking_id,'walkthrough_uploaded',jsonb_build_object('file_id',f.id));f.status='ready';return to_jsonb(f);
end $$;
create function public.api_remove_upload(p_file uuid) returns void language plpgsql security definer set search_path='' as $$
declare f public.walkthrough_files;b public.bookings;
begin select * into f from public.walkthrough_files where id=p_file;select * into b from public.bookings where id=f.booking_id for update;if f.id is null or not(public.is_owner() or private.owns_booking(f.booking_id)) or b.invoice_issued or b.status in('cancelled','completed') then raise exception 'File unavailable' using errcode='42501';end if;
 update public.walkthrough_files set status='deleted' where id=f.id;update public.bookings set reviewed=false,quote_status='not_reviewed',final_cents=null,revision=revision+1 where id=f.booking_id;perform private.log(f.booking_id,'walkthrough_removed',jsonb_build_object('file_id',f.id));end $$;
create function public.api_owner_customer(p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.customers;begin if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 update public.customers set name=trim(p_data->>'name'),phone=coalesce(p_data->>'phone',''),address=coalesce(p_data->>'address',''),access_notes=coalesce(p_data->>'access_notes',''),pet_notes=coalesce(p_data->>'pet_notes','') where id=p_id returning * into c;
 if c.id is null then raise exception 'Customer not found' using errcode='22023';end if;perform private.log(null,'customer_updated',jsonb_build_object('customer_id',p_id));return to_jsonb(c);end $$;
-- Deny direct mutations. All writes use guarded, transactional RPCs.
revoke all on all tables in schema public from anon,authenticated;
grant select on public.service_spaces,public.service_types,public.service_addons to anon,authenticated;
grant select on public.customers,public.bookings,public.quote_adjustments,public.payment_records,public.booking_requests,public.walkthrough_files,public.audit_events,public.notification_outbox,public.time_blocks,public.business_settings,public.owner_notes to authenticated;
alter table public.customers enable row level security;
create policy customer_read on public.customers for select to authenticated using(public.is_owner() or (auth_user_id=auth.uid() and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false));
alter table public.bookings enable row level security;
create function public.booking_access(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.owns_booking(p_id) $$;
create policy booking_read on public.bookings for select to authenticated using(public.is_owner() or public.booking_access(id));
do $$ declare t text;begin
 foreach t in array array['quote_adjustments','payment_records','booking_requests','walkthrough_files'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy scoped_read on public.%I for select to authenticated using(public.is_owner() or public.booking_access(booking_id))',t);
 end loop;
 foreach t in array array['audit_events','notification_outbox','time_blocks','business_settings','owner_notes'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy owner_read on public.%I for select to authenticated using(public.is_owner())',t);
 end loop;
end $$;
do $$ declare t text;begin foreach t in array array['service_spaces','service_types','service_addons'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy catalog_read on public.%I for select to anon,authenticated using(true)',t);end loop;end $$;
-- Private bucket. Only reserved paths can be uploaded; no overwriting is granted.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('walkthroughs','walkthroughs',false,20971520,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function public.walkthrough_access(p_path text,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.walkthrough_files f join public.bookings b on b.id=f.booking_id where f.path=p_path and f.status<>'deleted' and (p_write or f.status='ready') and (public.is_owner() or private.owns_booking(b.id)) and (not p_write or (not b.invoice_issued and b.status not in('completed','cancelled'))))
$$;
create policy walkthrough_read on storage.objects for select to authenticated using(bucket_id='walkthroughs' and public.walkthrough_access(name,false));
create policy walkthrough_insert on storage.objects for insert to authenticated with check(bucket_id='walkthroughs' and public.walkthrough_access(name,true));
-- No public storage reads or object UPDATE rights. Deletions are a two-step API operation.
-- Deletion is server-only after the guarded removal RPC invalidates prior quote approval.
alter table public.calendar_days enable row level security;
grant select on public.calendar_days to authenticated;
create policy calendar_days_owner on public.calendar_days for select to authenticated using(public.is_owner());
revoke execute on all functions in schema public from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function public.api_quote(text,integer,jsonb,jsonb),public.api_availability(date,integer) to anon,authenticated;
grant execute on function public.is_owner(),public.booking_access(uuid),public.walkthrough_access(text,boolean),public.api_create_booking(jsonb,uuid),public.api_booking_action(uuid,text,jsonb,uuid),public.api_save_owner_notes(uuid,text),public.api_owner_customer(uuid,jsonb),public.api_profile(jsonb),public.api_owner_schedule(text,jsonb),public.api_upload_request(uuid,jsonb),public.api_remove_upload(uuid) to authenticated;
grant execute on function public.api_upload_finish(uuid,uuid) to service_role;
commit;
