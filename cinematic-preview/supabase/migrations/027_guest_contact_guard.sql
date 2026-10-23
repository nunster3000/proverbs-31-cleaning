-- Anonymous session reuse must never redirect an earlier booking's private links to a new email.
begin;
create function private.guest_contact_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and lower(trim(new.email)) is distinct from lower(trim(old.email)) then raise exception 'Use the original guest email for this browser session. Contact Gabrielle to correct a booking email.' using errcode='42501';end if;
 return new;
end$$;
create trigger guest_contact_guard before update of email on public.customers for each row execute function private.guest_contact_guard();
revoke all on function private.guest_contact_guard() from public,anon,authenticated;
commit;
