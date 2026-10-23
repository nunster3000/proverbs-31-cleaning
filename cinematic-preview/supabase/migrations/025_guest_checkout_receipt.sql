-- Limited receipt polling for the anonymous identity that submitted the booking.
-- Full guest actions still require the private link delivered to the booking email.
begin;
create function public.api_guest_checkout_receipt(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b public.bookings;
begin
 if auth.uid() is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Guest receipt unavailable' using errcode='42501';end if;
 select * into b from public.bookings where id=p_id and creator_id=auth.uid();
 if b.id is null or not exists(select 1 from public.customers c where c.id=b.customer_id and not c.account_enabled) then raise exception 'Guest receipt unavailable' using errcode='42501';end if;
 return jsonb_build_object('id',b.id,'quote_snapshot',b.quote_snapshot,'deposit_paid_cents',b.deposit_paid_cents,'final_paid_cents',b.final_paid_cents,'status',b.status);
end$$;
revoke all on function public.api_guest_checkout_receipt(uuid) from public,anon;
grant execute on function public.api_guest_checkout_receipt(uuid) to authenticated;
commit;
