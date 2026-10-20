begin;
-- Existing bookings keep their quote_snapshot; these changes affect new quotes only.
create function public.api_owner_price(p_kind text,p_id text,p_cents integer,p_expected integer)
returns void language plpgsql security definer set search_path='' as $$
declare old_cents integer;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 if p_cents is null or p_expected is null or p_cents<0 or p_cents>1000000 then raise exception 'Enter a valid price up to $10,000';end if;
 if p_kind='space' then
  if p_cents=0 then raise exception 'Starting prices must be greater than zero';end if;
  select base_cents into old_cents from public.service_spaces where id::text=p_id for update;
 elsif p_kind='addon' then
  if p_cents=0 then raise exception 'Add-on prices must be greater than zero';end if;
  select cents into old_cents from public.service_addons where id=p_id for update;
 elsif p_kind='deep' and p_id='deep' then
  select upgrade_cents into old_cents from public.service_types where id='deep' for update;
 else raise exception 'Choose a valid pricing item';end if;
 if old_cents is null then raise exception 'Pricing item not found';end if;
 if old_cents<>p_expected then raise exception 'This price changed since you opened it. Refresh pricing and try again.';end if;
 if p_kind='space' then update public.service_spaces set base_cents=p_cents where id::text=p_id;
 elsif p_kind='addon' then update public.service_addons set cents=p_cents where id=p_id;
 else update public.service_types set upgrade_cents=p_cents where id='deep';end if;
 if old_cents<>p_cents then
  insert into public.audit_events(actor_id,action,details) values(auth.uid(),'pricing_changed',jsonb_build_object('kind',p_kind,'id',p_id,'old_cents',old_cents,'new_cents',p_cents));
 end if;
end $$;
revoke all on function public.api_owner_price(text,text,integer,integer) from public,anon;
grant execute on function public.api_owner_price(text,text,integer,integer) to authenticated;
commit;
