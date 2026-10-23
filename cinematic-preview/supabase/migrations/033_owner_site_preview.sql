-- A valid JWT alone cannot preserve prelaunch website access after logout.
begin;
create function public.api_owner_preview_session() returns boolean language plpgsql stable security definer set search_path='' as $$
declare sid text=auth.jwt()->>'session_id';
begin
 if not private.account_user() or not public.is_owner() or coalesce(sid,'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false;end if;
 return exists(select 1 from auth.sessions s where s.id=sid::uuid and s.user_id=auth.uid());
end$$;
revoke all on function public.api_owner_preview_session() from public,anon;
grant execute on function public.api_owner_preview_session() to authenticated;
commit;
