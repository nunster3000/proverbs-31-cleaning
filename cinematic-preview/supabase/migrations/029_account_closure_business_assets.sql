begin;
-- A former administrator may have uploaded business records for another customer.
-- Those records must be reassigned, never erased by their personal account closure.
alter function public.service_account_closure(text,uuid,jsonb) set schema private;
alter function private.service_account_closure(text,uuid,jsonb) rename to closure_worker_v028;
create function public.service_account_closure(p_action text,p_id uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.account_closures;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 if p_action in('files','scrub') then
  select * into job from private.account_closures where id=p_id;
  if exists(select 1 from public.walkthrough_files f join public.bookings b on b.id=f.booking_id where f.uploader_id=job.user_id and b.customer_id is distinct from job.customer_id)
   or exists(select 1 from storage.objects o where coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=job.user_id::text and (o.bucket_id<>'walkthroughs' or exists(select 1 from public.bookings b where b.id::text=split_part(o.name,'/',1) and b.customer_id is distinct from job.customer_id)))
  then raise exception 'Business records require safe reassignment before removing this former administrator account';end if;
 end if;
 return private.closure_worker_v028(p_action,p_id,p_data);
end$$;
revoke all on function public.service_account_closure(text,uuid,jsonb),private.closure_worker_v028(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.service_account_closure(text,uuid,jsonb) to service_role;
commit;
