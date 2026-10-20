-- Add post-cleaning evidence later without reopening pricing or payments.
begin;
create or replace function public.api_upload_request(p_id uuid,p_file jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.walkthrough_files;b public.bookings;key uuid=gen_random_uuid();
begin select * into b from public.bookings where id=p_id for update;if not(public.is_owner() or private.owns_booking(p_id)) or b.id is null or (b.invoice_issued and coalesce(p_file->>'purpose','walkthrough')<>'completion') or b.status='cancelled' then raise exception 'Walkthrough upload unavailable' using errcode='42501';end if;
 if coalesce(p_file->>'purpose','walkthrough')='completion' then
  if not public.is_owner() or b.status not in('in_progress','completed') or not b.walkthrough_approved or b.quote_status<>'accepted' or b.deposit_paid_cents<(b.quote_snapshot->>'deposit_cents')::integer then raise exception 'Completion uploads require an approved visit in progress' using errcode='42501';end if;
 elsif coalesce(p_file->>'purpose','walkthrough')<>'walkthrough' or b.status not in('requested','awaiting_walkthrough') then raise exception 'Walkthrough uploads are closed for this visit' using errcode='42501';end if;
 if(select count(*) from public.walkthrough_files where booking_id=p_id and status<>'deleted' and purpose=coalesce(p_file->>'purpose','walkthrough'))>=6 or coalesce((select sum(bytes) from public.walkthrough_files where booking_id=p_id and status<>'deleted' and purpose=coalesce(p_file->>'purpose','walkthrough')),0)+(p_file->>'bytes')::bigint>83886080 then raise exception 'Walkthrough file limit reached' using errcode='22023';end if;
 insert into public.walkthrough_files(id,booking_id,uploader_id,path,filename,mime,bytes,room,notes,purpose) values(key,p_id,auth.uid(),p_id::text||'/'||key::text,p_file->>'filename',p_file->>'mime',(p_file->>'bytes')::bigint,trim(p_file->>'room'),coalesce(p_file->>'notes',''),coalesce(p_file->>'purpose','walkthrough')) returning * into f;return to_jsonb(f);
end $$;
create or replace function public.api_upload_finish(p_file uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.walkthrough_files;b public.bookings;
begin select * into f from public.walkthrough_files where id=p_file;select * into b from public.bookings where id=f.booking_id for update;
 if f.status='ready' and (exists(select 1 from private.owner_accounts where user_id=p_actor) or exists(select 1 from public.customers where id=b.customer_id and auth_user_id=p_actor)) then return to_jsonb(f);end if;
 if f.id is null or not(exists(select 1 from private.owner_accounts where user_id=p_actor) or exists(select 1 from public.customers where id=b.customer_id and auth_user_id=p_actor)) or (b.invoice_issued and f.purpose<>'completion') or b.status='cancelled' or (b.status='completed' and f.purpose<>'completion') then raise exception 'File unavailable' using errcode='42501';end if;
 if not exists(select 1 from storage.objects o where bucket_id='walkthroughs' and name=f.path and (metadata->>'size')::bigint=f.bytes and metadata->>'mimetype'=f.mime) then raise exception 'Uploaded file does not match its reservation' using errcode='22023';end if;
 if f.purpose='completion' then
  if not exists(select 1 from private.owner_accounts where user_id=p_actor) or b.status not in('in_progress','completed') or not b.walkthrough_approved or b.quote_status<>'accepted' or b.deposit_paid_cents<(b.quote_snapshot->>'deposit_cents')::integer then raise exception 'Completion uploads require an approved visit in progress' using errcode='42501';end if;
  update public.walkthrough_files set status='ready' where id=f.id;
  update public.bookings set status='completed' where id=b.id;
  if b.status<>'completed' then insert into public.notification_outbox(booking_id,kind,recipient) select b.id,'service_completed',email from public.customers where id=b.customer_id;end if;
 else
  if b.status not in('requested','awaiting_walkthrough') then raise exception 'Walkthrough uploads are closed for this visit' using errcode='42501';end if;
  update public.walkthrough_files set status='ready' where id=f.id;
  update public.bookings set reviewed=false,walkthrough_approved=false,quote_status='not_reviewed',final_cents=null,revision=revision+1 where id=f.booking_id;
 end if;
 insert into public.audit_events(actor_id,booking_id,action,details) values(p_actor,f.booking_id,case when f.purpose='completion' then 'completion_uploaded' else 'walkthrough_uploaded' end,jsonb_build_object('file_id',f.id));f.status='ready';return to_jsonb(f);
end $$;
create or replace function public.walkthrough_access(p_path text,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.walkthrough_files f join public.bookings b on b.id=f.booking_id where f.path=p_path and f.status<>'deleted' and (p_write or f.status='ready') and (public.is_owner() or private.owns_booking(b.id)) and
 (not p_write or (f.purpose='completion' and public.is_owner() and b.status in('in_progress','completed') and b.walkthrough_approved and b.quote_status='accepted' and b.deposit_paid_cents>=(b.quote_snapshot->>'deposit_cents')::integer) or (f.purpose='walkthrough' and not b.invoice_issued and b.status in('requested','awaiting_walkthrough'))))
$$;
commit;
