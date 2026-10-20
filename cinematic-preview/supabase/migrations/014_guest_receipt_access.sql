-- Completed visits may receive fresh read-only guest access for receipts and balances.
begin;
create or replace function public.api_guest_issue(p_booking uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;c public.customers;g private.guest_booking_access;
begin
 if not public.is_owner() then raise exception 'Owner required' using errcode='42501';end if;
 select * into b from public.bookings where id=p_booking for update;select * into c from public.customers where id=b.customer_id;
 if b.id is null or b.status='cancelled' or c.account_enabled or c.email not like '%@%.%' then raise exception 'Guest booking with a contact email required' using errcode='22023';end if;
 update private.guest_booking_access set revoked_at=now() where booking_id=b.id and revoked_at is null;
 insert into private.guest_booking_access(booking_id,recipient_email,link_hash) values(b.id,lower(trim(c.email)),p_hash) returning * into g;
 perform private.log(b.id,'guest_link_issued',jsonb_build_object('access_id',g.id));
 return jsonb_build_object('id',g.id,'recipient',g.recipient_email,'expires_at',g.link_expires_at);
end $$;
commit;
