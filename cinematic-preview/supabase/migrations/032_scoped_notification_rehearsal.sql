-- Private operator rehearsal: never claims another booking or sends to a customer.
begin;
create or replace function public.service_rehearsal_notification_claim(p_booking uuid) returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or now()>=(select opens_at from private.guest_checkout_launch where id=true) then raise exception 'Private prelaunch rehearsal unavailable' using errcode='42501';end if;
 if not exists(select 1 from public.bookings b join public.customers c on c.id=b.customer_id where b.id=p_booking and b.care_notes like 'P31 CONNECTED REHEARSAL %' and lower(c.email)='khris.nun@proverbs31cleaningcoservices.info') then raise exception 'Rehearsal booking unavailable' using errcode='42501';end if;
 return query with jobs as(select n.id from public.notification_outbox n where n.booking_id=p_booking and n.recipient='khris.nun@proverbs31cleaningcoservices.info' and n.snapshot->'booking'->>'id'=p_booking::text and n.snapshot->'booking'->>'care_notes' like 'P31 CONNECTED REHEARSAL %' and n.status='pending_provider' and n.attempts<5 and n.next_attempt_at<=now() and (n.lease_until is null or n.lease_until<now()) and n.created_at>now()-interval '23 hours' order by n.created_at,n.id for update skip locked limit 10)
 update public.notification_outbox n set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=n.attempts+1 from jobs where n.id=jobs.id returning n.*;
end$$;
revoke all on function public.service_rehearsal_notification_claim(uuid) from public,anon,authenticated;
grant execute on function public.service_rehearsal_notification_claim(uuid) to service_role;
commit;
