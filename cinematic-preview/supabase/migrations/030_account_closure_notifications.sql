begin;
alter table private.account_closures add column notification_email text;
create table private.closure_issue_state(closure_id uuid primary key references private.account_closures(id),codes text[] not null default '{}',version integer not null default 0,updated_at timestamptz not null default now());
create table private.closure_issue_notices(
 id uuid primary key default gen_random_uuid(),closure_id uuid not null references private.account_closures(id),version integer not null,codes text[] not null,previous_codes text[] not null default '{}',created_at timestamptz not null default now(),owner_read_at timestamptz,
 recipient text,email_state text not null default 'pending' check(email_state in('pending','failed','sent','superseded')),attempts integer not null default 0,email_generation integer not null default 0,delivery_started_at timestamptz not null default now(),next_attempt_at timestamptz not null default now(),lease_id uuid,lease_until timestamptz,provider_id text,sent_at timestamptz,last_error text,unique(closure_id,version));
alter table private.closure_issue_state enable row level security;alter table private.closure_issue_notices enable row level security;
revoke all on private.closure_issue_state,private.closure_issue_notices from public,anon,authenticated;
create function public.service_closure_observe(p_id uuid,p_code text default null,p_lease uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.account_closures;preview jsonb;observed_codes text[]='{}';prior private.closure_issue_state;email text;h text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 select * into job from private.account_closures where id=p_id for update;
 if job.id is null or job.state in('withdrawn','completed') then return jsonb_build_object('delivery_pending',false);end if;
 if job.lease_token is distinct from p_lease or job.lease_until<now() then raise exception 'Maintenance lease changed';end if;
 if p_code is not null and p_code not in('payment_review','payment_processing','refund_pending','technical_retry','business_records') then raise exception 'Invalid issue category';end if;
 preview=private.closure_preview(job.user_id);
 for h in select jsonb_array_elements_text(preview->'holds') loop
  observed_codes=array_append(observed_codes,case when h like 'The final price or payment%' then 'billing_resolution' when h like 'A refund is awaiting%' then 'refund_pending' when h like 'A payment is processing%' then 'payment_processing' else 'payment_review' end);
 end loop;
 if exists(select 1 from private.account_refunds where closure_id=p_id and state='manual_required') then observed_codes=array_append(observed_codes,'external_refund');end if;
 if p_code is not null then observed_codes=array_append(observed_codes,p_code);end if;
 select coalesce(array_agg(distinct code order by code),'{}') into observed_codes from unnest(observed_codes) code;
 insert into private.closure_issue_state(closure_id) values(p_id) on conflict do nothing;
 select * into prior from private.closure_issue_state where closure_id=p_id for update;
 if observed_codes is distinct from prior.codes then
  select coalesce((select u.email from auth.users u where u.id=job.user_id and u.email_confirmed_at is not null),job.notification_email) into email;
  -- Auth-verified contact only; never accept a recipient supplied by a browser or job payload.
  if email is null then raise exception 'Verified customer contact unavailable';end if;
  update private.closure_issue_notices set email_state='superseded',recipient=null where closure_id=p_id and email_state in('pending','failed') and attempts=0 and lease_id is null;
  update private.closure_issue_state set codes=observed_codes,version=version+1,updated_at=now() where closure_id=p_id;
  insert into private.closure_issue_notices(closure_id,version,codes,previous_codes,recipient) values(p_id,prior.version+1,observed_codes,prior.codes,email);
 end if;
 return jsonb_build_object('delivery_pending',exists(select 1 from private.closure_issue_notices where closure_id=p_id and email_state in('pending','failed')),'codes',observed_codes);
end$$;
-- Private delivery queue: retries use the same provider idempotency key for 23 hours.
create function public.service_closure_mail(p_action text,p_id uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare n private.closure_issue_notices;result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 if p_action='claim' then
  with jobs as(select x.id from private.closure_issue_notices x join private.account_closures c on c.id=x.closure_id where x.email_state in('pending','failed') and x.recipient is not null and x.attempts<5 and x.delivery_started_at>now()-interval '23 hours' and x.next_attempt_at<=now() and coalesce(x.lease_until,'-infinity')<now() and c.state in('waiting','purging') order by x.created_at for update of x skip locked limit 10),claimed as(update private.closure_issue_notices x set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes' from jobs where x.id=jobs.id returning x.*)select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;return result;
 end if;
 if p_action='finish' then
  update private.closure_issue_notices set email_state=case when nullif(p_data->>'provider','') is null then 'failed' else 'sent' end,provider_id=nullif(p_data->>'provider',''),sent_at=case when nullif(p_data->>'provider','') is not null then now() else null end,
   recipient=case when nullif(p_data->>'provider','') is not null then null else recipient end,last_error=case when nullif(p_data->>'provider','') is null then 'Customer email was not acknowledged. Automatic retry or owner review is needed.' else null end,next_attempt_at=now()+interval '1 minute'*power(2,attempts),lease_id=null,lease_until=null
  where id=p_id and lease_id=(p_data->>'lease')::uuid and email_generation=(p_data->>'generation')::integer returning * into n;
  return jsonb_build_object('saved',n.id is not null);
 end if;
 raise exception 'Invalid delivery action';
end$$;
create function public.api_closure_notifications(p_read uuid[] default '{}',p_retry uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare retry_notice private.closure_issue_notices;email text;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 if coalesce(array_length(p_read,1),0)>100 then raise exception 'Too many notice IDs';end if;
 update private.closure_issue_notices set owner_read_at=now() where id=any(p_read);
 if p_retry is not null then
  select * into retry_notice from private.closure_issue_notices where id=p_retry for update;
  if retry_notice.id is null or retry_notice.email_state not in('failed','pending') or retry_notice.lease_until>now() then raise exception 'This email cannot be retried now';end if;
  select coalesce(u.email,c.notification_email) into email from private.account_closures c left join auth.users u on u.id=c.user_id and u.email_confirmed_at is not null where c.id=retry_notice.closure_id and c.state in('waiting','purging');
  if email is null then raise exception 'Verified customer contact unavailable';end if;
  update private.closure_issue_notices set email_state='pending',recipient=email,attempts=0,email_generation=email_generation+1,delivery_started_at=now(),next_attempt_at=now(),lease_id=null,lease_until=null,last_error=null where id=p_retry;
  perform private.log(null,'account_closure_email_retry',jsonb_build_object('notice_id',p_retry));
 end if;
 return jsonb_build_object('unread',(select count(*) from private.closure_issue_notices where owner_read_at is null),'open',(select count(*) from private.closure_issue_state s join private.account_closures c on c.id=s.closure_id where cardinality(s.codes)>0 and c.state in('waiting','purging')),
  'email_failures',(select count(*) from private.closure_issue_notices where email_state='failed' or email_state='pending' and delivery_started_at<=now()-interval '23 hours'),
  'items',coalesce((select jsonb_agg(to_jsonb(x)) from(select n.id,n.closure_id,c.customer_id,coalesce(nullif(p.name,'Deleted customer'),'Archived customer') customer_name,n.codes,n.previous_codes,n.created_at,n.owner_read_at,n.email_state,n.attempts,n.last_error,(n.attempts>=5 or n.delivery_started_at<=now()-interval '23 hours') email_held,c.state closure_state,coalesce(s.codes,'{}') current_codes
  from private.closure_issue_notices n join private.account_closures c on c.id=n.closure_id left join public.customers p on p.id=c.customer_id left join private.closure_issue_state s on s.closure_id=c.id order by n.created_at desc,n.version desc limit 100)x),'[]'));
end$$;
-- A successfully delivered issue/resolution email must precede final removal of its contact.
-- No deletion approval is introduced; email failures simply wait and appear in Notifications.
alter function public.service_account_closure(text,uuid,jsonb) set schema private;
alter function private.service_account_closure(text,uuid,jsonb) rename to closure_worker_v029;
create function public.service_account_closure(p_action text,p_id uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 if p_action in('freeze','scrub','complete') and exists(select 1 from private.closure_issue_notices where closure_id=p_id and email_state in('pending','failed')) then raise exception 'Customer deletion update is awaiting email delivery';end if;
 result=private.closure_worker_v029(p_action,p_id,p_data);
 if p_action='claim' and result is not null then result=result||jsonb_build_object('auth_removed',not exists(select 1 from auth.users where id=(result->>'user_id')::uuid));end if;
 return result;
end$$;
create function private.closure_contact_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.state='purging' and new.notification_email is null then select email into new.notification_email from auth.users where id=new.user_id and email_confirmed_at is not null;end if;
 if new.state in('completed','withdrawn') then new.notification_email=null;
  if new.state='withdrawn' then update private.closure_issue_notices set email_state='superseded',recipient=null,lease_id=null,lease_until=null where closure_id=new.id and email_state in('pending','failed');end if;
 end if;
 return new;
end$$;
create trigger closure_notification_contact before update of state on private.account_closures for each row execute function private.closure_contact_lifecycle();
revoke all on function public.service_account_closure(text,uuid,jsonb),private.closure_worker_v029(text,uuid,jsonb),public.service_closure_observe(uuid,text,uuid),public.service_closure_mail(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.service_account_closure(text,uuid,jsonb),public.service_closure_observe(uuid,text,uuid),public.service_closure_mail(text,uuid,jsonb) to service_role;
revoke all on function public.api_closure_notifications(uuid[],uuid) from public,anon;
grant execute on function public.api_closure_notifications(uuid[],uuid) to authenticated;
create or replace function public.service_operations_health() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('backup',to_jsonb(h),'email_failures',(select count(*) from public.notification_outbox where sent_at is null and (attempts>=5 or created_at<now()-interval '23 hours')),'account_deletion_failures',(select count(*) from private.account_closures where state in('waiting','purging') and attempts>=3 and last_error is not null),'account_deletion_notification_failures',(select count(*) from private.account_closures where state='completed' and notified_at is null and deleted_at<now()-interval '1 hour'),'account_deletion_customer_email_failures',(select count(*) from private.closure_issue_notices where email_state in('pending','failed') and (attempts>=5 or delivery_started_at<now()-interval '23 hours'))) from private.backup_health h where id$$;
commit;
