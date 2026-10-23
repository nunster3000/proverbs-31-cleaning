-- Enabling CAPTCHA-protected anonymous auth must not open direct database booking early.
begin;
create table private.guest_checkout_launch(id boolean primary key default true check(id),opens_at timestamptz not null default '2026-10-26T09:00:00-04:00');
insert into private.guest_checkout_launch(id) values(true);
alter table private.guest_checkout_launch enable row level security;
revoke all on private.guest_checkout_launch from public,anon,authenticated;
create function private.guest_booking_launch_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and now()<(select opens_at from private.guest_checkout_launch where id) then raise exception 'Website and booking open October 26 at 9:00 AM Eastern.' using errcode='42501';end if;
 return new;
end$$;
create trigger guest_booking_launch_guard before insert on public.bookings for each row execute function private.guest_booking_launch_guard();
revoke all on function private.guest_booking_launch_guard() from public,anon,authenticated;
commit;
