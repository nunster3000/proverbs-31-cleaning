begin;
-- This journal contains identifiers, not contact details, and survives Auth deletion.
create table private.account_closures(
 id uuid primary key default gen_random_uuid(),user_id uuid not null,customer_id uuid references public.customers(id),
 mode text not null check(mode in('keep','cancel')),state text not null default 'waiting' check(state in('waiting','purging','completed','withdrawn')),
 requested_at timestamptz not null default now(),deleted_at timestamptz,lease_until timestamptz,lease_token uuid,last_error text,
 receipt_hash text check(receipt_hash ~ '^[a-f0-9]{64}$'),notified_at timestamptz,notice_read_at timestamptz,attempts integer not null default 0);
create unique index one_account_closure on private.account_closures(user_id) where state<>'withdrawn';
create table private.closure_cancellations(closure_id uuid references private.account_closures(id),booking_id uuid primary key references public.bookings(id),paid_cents integer not null,retain_cents integer not null,refund_cents integer not null,notice_hours numeric not null,cancelled_at timestamptz not null default now());
create table private.account_refunds(id uuid primary key default gen_random_uuid(),closure_id uuid not null references private.account_closures(id),payment_id uuid not null unique references public.payment_records(id),cents integer not null check(cents>0),state text not null default 'pending' check(state in('pending','succeeded','manual_required')),provider_reference text,settled_at timestamptz);
alter table private.account_closures enable row level security;alter table private.closure_cancellations enable row level security;alter table private.account_refunds enable row level security;
revoke all on private.account_closures,private.closure_cancellations,private.account_refunds from public,anon,authenticated;
alter table public.customers add column deleted_at timestamptz;
-- Evidence retains the original signer identifier without retaining an Auth account.
alter table public.access_signatures drop constraint access_signatures_signer_id_fkey;
alter table public.access_signatures drop constraint access_signatures_representative_id_fkey;
alter table public.access_forms drop constraint access_forms_representative_authorized_by_fkey;
alter table private.launch_preparation drop constraint launch_preparation_approved_by_fkey;
alter table public.bookings drop constraint bookings_creator_id_fkey,add constraint bookings_creator_id_fkey foreign key(creator_id) references auth.users(id) on delete set null;
alter table public.payment_records drop constraint payment_records_recorded_by_fkey,add constraint payment_records_recorded_by_fkey foreign key(recorded_by) references auth.users(id) on delete set null;
alter table public.audit_events drop constraint audit_events_actor_id_fkey,add constraint audit_events_actor_id_fkey foreign key(actor_id) references auth.users(id) on delete set null;
create or replace function private.account_user() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) and not exists(select 1 from private.account_closures where user_id=auth.uid() and state in('purging','completed'))$$;
create function public.customer_account_active() returns boolean language sql stable security definer set search_path='' as $$select private.account_user()$$;
revoke all on function public.customer_account_active() from public,anon;grant execute on function public.customer_account_active() to authenticated;
drop policy customer_read on public.customers;
create policy customer_read on public.customers for select to authenticated using(public.is_owner() or (auth_user_id=auth.uid() and public.customer_account_active()));
-- Reject stale JWT writes, new bookings while closure is scheduled, and admin edits during purge.
create function private.closure_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid;cid uuid;
begin
 if coalesce(auth.jwt()->>'role','')='service_role' then return new;end if;
 uid=auth.uid();
 if exists(select 1 from private.account_closures where user_id=uid and state in('purging','completed')) then raise exception 'This account is being deleted' using errcode='42501';end if;
 if tg_table_name='customers' then cid=new.id;else cid=new.customer_id;end if;
 if exists(select 1 from private.account_closures where customer_id=cid and state in('purging','completed')) then raise exception 'Archived customer record cannot be changed' using errcode='42501';end if;
 if tg_table_name='bookings' and tg_op='INSERT' and exists(select 1 from private.account_closures where customer_id=cid and state='waiting') then raise exception 'Withdraw the scheduled account deletion before adding another booking';end if;
 return new;
end$$;
create trigger customer_closure_guard before insert or update on public.customers for each row execute function private.closure_guard();
create trigger booking_closure_guard before insert or update on public.bookings for each row execute function private.closure_guard();
create function private.closure_retained(p_start timestamptz,p_now timestamptz,p_paid integer,p_deposit integer) returns integer language sql immutable set search_path='' as $$select case when p_start-p_now>=interval '72 hours' then 0 else least(p_paid,p_deposit) end$$;
create function private.closure_preview(p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cid uuid;b public.bookings;items jsonb='[]';holds jsonb='[]';paid integer;refund integer;retain integer;hours numeric;job private.account_closures;
begin
 select id into cid from public.customers where auth_user_id=p_user;
 select * into job from private.account_closures where user_id=p_user and state<>'withdrawn';
 if cid is null and job.customer_id is not null then cid=job.customer_id;end if;
 for b in select * from public.bookings where customer_id=cid order by visit_date,id loop
  paid=b.deposit_paid_cents+b.final_paid_cents;
  if paid<>(select coalesce(sum(cents),0) from public.payment_records where booking_id=b.id) then holds=holds||jsonb_build_array('Payment records need reconciliation for booking '||left(b.id::text,8));end if;
  if exists(select 1 from private.stripe_checkouts where booking_id=b.id and (state='review' or (state in('creating','open') and expires_at>now()))) then holds=holds||jsonb_build_array('A payment is processing or needs review for booking '||left(b.id::text,8));end if;
  if b.status='completed' and (b.final_cents is null or not b.invoice_issued or b.quote_status<>'accepted' or b.final_cents<>paid) then holds=holds||jsonb_build_array('The final price or payment is unresolved for booking '||left(b.id::text,8));end if;
  if b.status='cancelled' and paid>0 and not exists(select 1 from private.closure_cancellations where booking_id=b.id) then holds=holds||jsonb_build_array('The cancelled booking needs refund reconciliation: '||left(b.id::text,8));end if;
  if b.status not in('completed','cancelled') then
   hours=extract(epoch from (((b.visit_date::timestamp+make_interval(mins=>private.window_start(b.arrival))) at time zone 'America/New_York')-now()))/3600;
   retain=private.closure_retained((b.visit_date::timestamp+make_interval(mins=>private.window_start(b.arrival))) at time zone 'America/New_York',now(),paid,(b.quote_snapshot->>'deposit_cents')::integer);refund=paid-retain;
   items=items||jsonb_build_array(jsonb_build_object('id',b.id,'date',b.visit_date,'arrival',b.arrival,'service',b.service,'revision',b.revision,'status',b.status,'paid_cents',paid,'retain_cents',retain,'refund_cents',refund,'full_refund',hours>=72,'can_cancel',hours>0 and b.status not in('on_the_way','in_progress')));
  end if;
 end loop;
 if exists(select 1 from private.account_refunds where closure_id=job.id and state<>'succeeded') then holds=holds||jsonb_build_array('A refund is awaiting completion. Your account will remain until the refund is resolved.');end if;
 return jsonb_build_object('upcoming',items,'holds',holds,'request',case when job.id is null then null else jsonb_build_object('id',job.id,'mode',job.mode,'state',job.state,'requested_at',job.requested_at,'maintenance_notice',case when job.last_error is not null then 'A payment or technical check is pending. Your account has not been deleted; the request will retry automatically.' else null end) end,'fingerprint',md5(items::text||holds::text));
end$$;
create function public.api_account_closure(p_action text default 'preview',p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;job private.account_closures;cid uuid;b public.bookings;item jsonb;pay public.payment_records;remaining integer;amount integer;paid integer;retain integer;
begin
 if not private.account_user() or public.is_owner() then raise exception 'Customer sign-in required. The business owner account cannot be deleted here.' using errcode='42501';end if;
 perform 1 from public.business_settings where id=true for update;
 result=private.closure_preview(auth.uid());
 if p_action='preview' then return result;end if;
 if p_action='withdraw' then update private.account_closures set state='withdrawn' where user_id=auth.uid() and state='waiting' and mode='keep';return private.closure_preview(auth.uid());end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) a where a->>'method'<>'anonymous' and (a->>'timestamp')::numeric between extract(epoch from now())-600 and extract(epoch from now())+30) then raise exception 'Use a fresh email sign-in link before confirming deletion' using errcode='42501';end if;
 if p_action<>'request' or coalesce(p_data->>'mode','') not in('keep','cancel') or p_data->>'confirmation' is distinct from 'DELETE' then raise exception 'Confirm how to handle your bookings and type DELETE' using errcode='22023';end if;
 select * into job from private.account_closures where user_id=auth.uid() and state<>'withdrawn';if job.id is not null then update private.account_closures set receipt_hash=p_data->>'receipt_hash' where id=job.id;return result;end if;
 if result->>'fingerprint' is distinct from p_data->>'fingerprint' then raise exception 'Bookings or payments changed. Review the updated summary first.';end if;
 if p_data->>'mode'='cancel' and (jsonb_array_length(result->'holds')>0 or exists(select 1 from jsonb_array_elements(result->'upcoming') x where not (x->>'can_cancel')::boolean)) then raise exception 'Resolve the listed booking and payment issues before cancelling and deleting.';end if;
 select id into cid from public.customers where auth_user_id=auth.uid();
 insert into private.account_closures(user_id,customer_id,mode,receipt_hash) values(auth.uid(),cid,p_data->>'mode',p_data->>'receipt_hash') returning * into job;
 if job.mode='cancel' then
  for item in select * from jsonb_array_elements(result->'upcoming') loop
   select * into b from public.bookings where id=(item->>'id')::uuid for update;
   paid=(item->>'paid_cents')::integer;retain=(item->>'retain_cents')::integer;remaining=paid-retain;
   insert into private.closure_cancellations values(job.id,b.id,paid,retain,remaining,extract(epoch from (((b.visit_date::timestamp+make_interval(mins=>private.window_start(b.arrival))) at time zone 'America/New_York')-now()))/3600,now());
   update public.bookings set status='cancelled',revision=revision+1 where id=b.id;
   update public.booking_requests set resolved=true,decision='approved',review_notes='Customer cancelled during account closure',decided_at=now() where booking_id=b.id and not resolved;
   for pay in select * from public.payment_records where booking_id=b.id order by case when kind='final' then 0 else 1 end,created_at desc,id loop
    amount=least(remaining,pay.cents);if amount>0 then insert into private.account_refunds(closure_id,payment_id,cents,state) values(job.id,pay.id,amount,case when pay.provider='stripe' then 'pending' else 'manual_required' end);remaining=remaining-amount;end if;
   end loop;
   perform private.log(b.id,'account_closure_cancelled',jsonb_build_object('refund_cents',paid-retain,'retained_deposit_cents',retain));
  end loop;
 end if;
 return private.closure_preview(auth.uid());
end$$;
-- Server-only worker contract. All mutations serialize with booking/payment operations.
create function public.service_account_closure(p_action text,p_id uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.account_closures;preview jsonb;cid uuid;result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 if p_action='receipt' then return (select jsonb_build_object('state',state) from private.account_closures where receipt_hash=p_data->>'hash' and state<>'withdrawn' and requested_at>now()-interval '90 days');end if;
 if p_action='queue' then return coalesce((select jsonb_agg(to_jsonb(q)) from(select id from private.account_closures where (state in('waiting','purging') or (state='completed' and deleted_at>now()-interval '24 hours')) and coalesce(lease_until,'-infinity')<now() order by case when state='completed' then 1 else 0 end,lease_until nulls first,requested_at limit 10)q),'[]');end if;
 if p_action='sweep' then
  select * into job from private.account_closures where id=p_id and state='completed';
  if job.id is null then return '[]';end if;
  if job.lease_token is distinct from (p_data->>'lease_token')::uuid then raise exception 'Maintenance lease changed';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name)) from storage.objects o where bucket_id='walkthroughs' and split_part(name,'/',1) in(select id::text from public.bookings where customer_id=job.customer_id)),'[]');
 end if;
 if p_action='notices' then return coalesce((select jsonb_agg(jsonb_build_object('id',id,'deleted_at',deleted_at)) from private.account_closures where state='completed' and notified_at is null),'[]');end if;
 perform 1 from public.business_settings where id=true for update;
 select * into job from private.account_closures where id=p_id for update;if job.id is null then raise exception 'Request not found';end if;cid=job.customer_id;
 if p_action='notified' then update private.account_closures set notified_at=now() where id=p_id and state='completed';return '{}';end if;
 if p_action not in('claim','notified') and job.lease_token is not null and (job.lease_token is distinct from (p_data->>'lease_token')::uuid or job.lease_until<now()) then raise exception 'Maintenance lease changed';end if;
 if p_action='release' then update private.account_closures set lease_until=now()+interval '5 minutes',last_error=coalesce(left(p_data->>'error',100),last_error),attempts=attempts+case when p_data ? 'error' then 1 else 0 end where id=p_id;return '{}';end if;
 if p_action='claim' then
  if job.state not in('waiting','purging','completed') or coalesce(job.lease_until,'-infinity')>now() then return null;end if;
  update private.account_closures set lease_until=now()+interval '4 minutes',lease_token=gen_random_uuid() where id=p_id returning * into job;
  preview=private.closure_preview(job.user_id);
  return to_jsonb(job)||jsonb_build_object('preview',preview,'checkouts',coalesce((select jsonb_agg(to_jsonb(a)) from private.stripe_checkouts a join public.bookings b on b.id=a.booking_id where b.customer_id=cid and a.state in('creating','open','expired')),'[]'),'payments',coalesce((select jsonb_agg(to_jsonb(p)) from public.payment_records p join public.bookings b on b.id=p.booking_id where b.customer_id=cid),'[]'),'refunds',coalesce((select jsonb_agg(to_jsonb(r)) from private.account_refunds r where r.closure_id=p_id),'[]'));
 end if;
 if p_action='checkout_expired' then
  update private.stripe_checkouts set state='expired' where id=(p_data->>'attempt')::uuid and booking_id in(select id from public.bookings where customer_id=cid) and state in('creating','open','expired');return '{}';
 end if;
 if p_action='refund' then
  update private.account_refunds set state=case when (p_data->>'succeeded')::boolean then 'succeeded' else 'pending' end,provider_reference=p_data->>'reference',settled_at=case when (p_data->>'succeeded')::boolean then now() else null end where id=(p_data->>'refund_id')::uuid and closure_id=p_id and state='pending';return '{}';
 end if;
 if p_action='freeze' then
  if job.state not in('waiting','purging') then raise exception 'Request is no longer active';end if;
  preview=private.closure_preview(job.user_id);
  if jsonb_array_length(preview->'upcoming')>0 or jsonb_array_length(preview->'holds')>0 then raise exception 'Bookings or payments are not resolved';end if;
  if exists(select 1 from private.owner_accounts where user_id=job.user_id) then raise exception 'Owner accounts cannot be deleted';end if;
  if exists(select 1 from public.notification_outbox n join public.bookings b on b.id=n.booking_id where b.customer_id=cid and n.lease_until>now()) then raise exception 'A notification is finishing delivery';end if;
  delete from public.notification_outbox where booking_id in(select id from public.bookings where customer_id=cid);
  update private.account_closures set state='purging' where id=p_id and state='waiting';
  update private.guest_booking_access set revoked_at=now(),recipient_email='',session_hash=null,session_expires_at=null where booking_id in(select id from public.bookings where customer_id=cid);
  return '{}';
 end if;
 if p_action='files' then
  if job.state<>'purging' then raise exception 'Account not frozen';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name)) from storage.objects o where (bucket_id='walkthroughs' and (split_part(name,'/',1) in(select id::text from public.bookings where customer_id=cid) or exists(select 1 from public.walkthrough_files f join public.bookings b on b.id=f.booking_id where b.customer_id=cid and f.path=o.name))) or (bucket_id='walkthroughs' and coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=job.user_id::text)),'[]');
 end if;
 if p_action='scrub' then
  if job.state<>'purging' then raise exception 'Account not frozen';end if;
  if exists(select 1 from storage.objects o where (bucket_id='walkthroughs' and exists(select 1 from public.walkthrough_files f join public.bookings b on b.id=f.booking_id where b.customer_id=cid and f.path=o.name)) or coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=job.user_id::text) then raise exception 'Private uploads are still being removed';end if;
  delete from public.walkthrough_files where booking_id in(select id from public.bookings where customer_id=cid) or uploader_id=job.user_id;
  delete from public.notification_outbox where booking_id in(select id from public.bookings where customer_id=cid);
  delete from public.owner_notes where booking_id in(select id from public.bookings where customer_id=cid);
  update public.booking_requests set notes='Archived request',review_notes='' where booking_id in(select id from public.bookings where customer_id=cid);
  update public.bookings set property=jsonb_strip_nulls(jsonb_build_object('name',property->>'name','address',property->>'address')),care_notes='',review_notes='' where customer_id=cid;
  update public.customers set auth_user_id=null,account_enabled=false,name='Deleted customer',email='',phone='',address='',access_notes='',pet_notes='',deleted_at=coalesce(deleted_at,now()) where id=cid;
  update private.privacy_requests set notes='',status='completed',updated_at=now() where customer_id=cid;
  update public.audit_events set details='{}' where booking_id in(select id from public.bookings where customer_id=cid);
  delete from private.customer_notice_reads where user_id=job.user_id;
  delete from private.admin_notice_reads where owner_id=job.user_id;
  return '{}';
 end if;
 if p_action='complete' then
  if job.state<>'purging' or exists(select 1 from auth.users where id=job.user_id) then raise exception 'Account removal is not complete';end if;
  update private.account_closures set state='completed',deleted_at=now(),lease_until=null,last_error=null where id=p_id;return '{}';
 end if;
 raise exception 'Invalid maintenance action';
end$$;
create function public.api_account_closure_notices(p_read uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 if p_read is not null then update private.account_closures set notice_read_at=now() where id=p_read and state='completed';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'customer_id',customer_id,'deleted_at',deleted_at,'read',notice_read_at is not null)) from private.account_closures where state='completed'),'[]');end$$;
create function public.api_account_refunds(p_id uuid default null,p_reference text default null) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 if p_id is not null then
  if length(trim(coalesce(p_reference,''))) not between 5 and 150 then raise exception 'Record the completed external refund reference';end if;
  update private.account_refunds set state='succeeded',settled_at=now(),provider_reference=p_reference where id=p_id and state='manual_required';
 end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(select r.id,r.cents,r.state,r.provider_reference,p.method,p.booking_id,c.name from private.account_refunds r join public.payment_records p on p.id=r.payment_id join public.bookings b on b.id=p.booking_id join public.customers c on c.id=b.customer_id where r.state<>'succeeded')x),'[]');end$$;
revoke all on function public.api_account_closure(text,jsonb),public.api_account_closure_notices(uuid),public.api_account_refunds(uuid,text) from public,anon;
grant execute on function public.api_account_closure(text,jsonb),public.api_account_closure_notices(uuid),public.api_account_refunds(uuid,text) to authenticated;
revoke all on function public.service_account_closure(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.service_account_closure(text,uuid,jsonb) to service_role;
create or replace function public.service_operations_health() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('backup',to_jsonb(h),'email_failures',(select count(*) from public.notification_outbox where sent_at is null and (attempts>=5 or created_at<now()-interval '23 hours')),'account_deletion_failures',(select count(*) from private.account_closures where state in('waiting','purging') and attempts>=3 and last_error is not null),'account_deletion_notification_failures',(select count(*) from private.account_closures where state='completed' and notified_at is null and deleted_at<now()-interval '1 hour')) from private.backup_health h where id$$;
commit;
