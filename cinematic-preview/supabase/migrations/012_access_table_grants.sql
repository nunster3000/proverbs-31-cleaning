-- Supabase may automatically grant table privileges to API roles.
-- Keep access records read-only outside the guarded signing/publishing RPCs.
begin;
revoke all on public.access_forms,public.access_signatures from public,anon,authenticated;
grant select on public.access_forms,public.access_signatures to authenticated;
commit;
