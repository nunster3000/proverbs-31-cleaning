-- Align guest database protection with the October 26, 2026 5 AM Atlanta launch.
begin;
alter table private.guest_checkout_launch alter column opens_at set default '2026-10-26T05:00:00-04:00';
update private.guest_checkout_launch set opens_at='2026-10-26T05:00:00-04:00' where id=true;
create or replace function private.guest_booking_launch_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and now()<(select opens_at from private.guest_checkout_launch where id) then raise exception 'Website and booking open October 26 at 5:00 AM Eastern.' using errcode='42501';end if;
 return new;
end$$;
revoke all on function private.guest_booking_launch_guard() from public,anon,authenticated;
commit;
