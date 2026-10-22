begin;
alter table public.notification_outbox add column attempts integer not null default 0,
 add column next_attempt_at timestamptz not null default now(),
 add column lease_id uuid, add column lease_until timestamptz,
 add column provider_id text, add column sent_at timestamptz,
 add column last_error text, add column snapshot jsonb;
create function private.notification_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.bookings;c public.customers;
begin
 select * into b from public.bookings where id=new.booking_id;
 select * into c from public.customers where id=b.customer_id;
 new.recipient=lower(trim(c.email));
 new.snapshot=jsonb_build_object('booking',to_jsonb(b)||jsonb_build_object('quote_adjustments',coalesce((select jsonb_agg(to_jsonb(q)) from public.quote_adjustments q where q.booking_id=b.id),'[]'::jsonb)),'account_enabled',c.account_enabled);
 return new;
end $$;
create trigger notification_snapshot before insert on public.notification_outbox for each row execute function private.notification_snapshot();
-- Historical rows remain held for owner review; deployment must never send a backlog unexpectedly.
update public.notification_outbox set status='failed',last_error='Historical notification held for review' where status<>'sent';
create function public.api_notification_claim(p_limit integer default 10) returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$
begin
 update public.notification_outbox n set status='failed',last_error='Recipient changed; owner review required',lease_id=null,lease_until=null where n.status='pending_provider' and (n.lease_until is null or n.lease_until<now()) and not exists(select 1 from public.bookings b join public.customers c on c.id=b.customer_id where b.id=n.booking_id and lower(trim(c.email))=n.recipient);
 update public.notification_outbox set status='failed',last_error='Delivery window expired; owner review required',lease_id=null,lease_until=null where status='pending_provider' and created_at<=now()-interval '23 hours' and (lease_until is null or lease_until<now());
 return query with jobs as (
  select id from public.notification_outbox where status='pending_provider' and snapshot is not null
   and attempts<5 and next_attempt_at<=now() and (lease_until is null or lease_until<now())
   and created_at>now()-interval '23 hours' order by created_at,id for update skip locked limit least(greatest(p_limit,1),10)
 ) update public.notification_outbox n set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=n.attempts+1 from jobs where n.id=jobs.id returning n.*;
end $$;
create function public.api_notification_finish(p_id uuid,p_lease uuid,p_provider text,p_error text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.notification_outbox set status=case when p_provider is not null then 'sent' when attempts>=5 then 'failed' else 'pending_provider' end,
 provider_id=p_provider,sent_at=case when p_provider is not null then now() else null end,
 last_error=case when p_provider is not null then null else left(p_error,200) end,
 next_attempt_at=now()+interval '1 minute'*power(2,attempts),lease_id=null,lease_until=null
 where id=p_id and lease_id=p_lease and status='pending_provider';
 return found;
end $$;
create function public.api_notification_guest_link(p_id uuid,p_lease uuid,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notification_outbox;b public.bookings;c public.customers;
begin
 select * into n from public.notification_outbox where id=p_id and lease_id=p_lease and lease_until>now() and status='pending_provider';
 if n.id is null then return false;end if;
 select * into b from public.bookings where id=n.booking_id;select * into c from public.customers where id=b.customer_id;
 if c.account_enabled or lower(trim(c.email))<>n.recipient or b.status='cancelled' then return false;end if;
 insert into private.guest_booking_access(booking_id,recipient_email,link_hash) values(b.id,n.recipient,p_hash) on conflict(link_hash) do nothing;
 return exists(select 1 from private.guest_booking_access where link_hash=p_hash and revoked_at is null and redeemed_at is null and link_expires_at>now());
end $$;
revoke all on function private.notification_snapshot() from public,anon,authenticated;
revoke all on function public.api_notification_claim(integer),public.api_notification_finish(uuid,uuid,text,text),public.api_notification_guest_link(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.api_notification_claim(integer),public.api_notification_finish(uuid,uuid,text,text),public.api_notification_guest_link(uuid,uuid,text) to service_role;
commit;
