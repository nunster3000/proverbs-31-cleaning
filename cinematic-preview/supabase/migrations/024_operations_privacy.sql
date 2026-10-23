begin;
create table private.backup_health(id boolean primary key default true check(id),succeeded_at timestamptz,failed_at timestamptz,run_id text,alerted_at timestamptz);
insert into private.backup_health(id) values(true);
alter table private.backup_health enable row level security;
revoke all on private.backup_health from public,anon,authenticated;
create function public.service_backup_report(p_success boolean,p_run text) returns void language plpgsql security definer set search_path='' as $$begin
 if length(coalesce(p_run,'')) not between 1 and 120 then raise exception 'Run reference required';end if;
 update private.backup_health set succeeded_at=case when p_success then now() else succeeded_at end,failed_at=case when p_success then failed_at else now() end,run_id=p_run where id;
end$$;
create function public.service_operations_health() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('backup',to_jsonb(h),'email_failures',(select count(*) from public.notification_outbox where sent_at is null and (attempts>=5 or created_at<now()-interval '23 hours'))) from private.backup_health h where id$$;
create function public.service_operations_alerted() returns void language sql security definer set search_path='' as $$update private.backup_health set alerted_at=now() where id$$;
revoke all on function public.service_backup_report(boolean,text),public.service_operations_health(),public.service_operations_alerted() from public,anon,authenticated;
grant execute on function public.service_backup_report(boolean,text),public.service_operations_health(),public.service_operations_alerted() to service_role;
create table private.privacy_requests(id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.customers(id),kind text not null check(kind in('access','correction','deletion')),status text not null default 'received' check(status in('received','verified','reviewed','completed','declined')),notes text not null default '' check(length(notes)<=2000),identity_verified_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),revision integer not null default 0);
alter table private.privacy_requests enable row level security;
revoke all on private.privacy_requests from public,anon,authenticated;
create function public.api_privacy(p_action text default 'list',p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.privacy_requests;result jsonb;next_status text;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 if p_action='list' then return coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from(select p.*,c.name,c.email from private.privacy_requests p join public.customers c on c.id=p.customer_id order by p.created_at desc limit 200)x),'[]');end if;
 if p_action='create' then
  insert into private.privacy_requests(customer_id,kind,notes) values((p_data->>'customer_id')::uuid,p_data->>'kind',coalesce(p_data->>'notes','')) returning * into r;
 else
  select * into r from private.privacy_requests where id=(p_data->>'id')::uuid for update;
  if r.id is null then raise exception 'Request not found';end if;
  if p_action in('inventory','export') then
   if r.identity_verified_at is null then raise exception 'Verify requester identity first' using errcode='42501';end if;
   if p_action='inventory' then return jsonb_build_object('customer_id',r.customer_id,'bookings',(select count(*) from public.bookings where customer_id=r.customer_id),'media',(select count(*) from public.walkthrough_files f join public.bookings b on b.id=f.booking_id where b.customer_id=r.customer_id and f.status<>'deleted'),'agreements',(select count(*) from public.access_signatures s join public.bookings b on b.id=s.booking_id where b.customer_id=r.customer_id),'payment_records',(select count(*) from public.payment_records p join public.bookings b on b.id=p.booking_id where b.customer_id=r.customer_id),'deletion_enabled',false,'notice','Review retention and record holds before deletion. This inventory changes no records.');end if;
   select jsonb_build_object('generated_at',now(),'customer',(select to_jsonb(c)-'access_notes'-'pet_notes' from public.customers c where c.id=r.customer_id),'bookings',coalesce((select jsonb_agg(to_jsonb(b)-'owner_notes'-'review_notes') from public.bookings b where customer_id=r.customer_id),'[]'),'agreements',coalesce((select jsonb_agg(to_jsonb(s)) from public.access_signatures s join public.bookings b on b.id=s.booking_id where b.customer_id=r.customer_id),'[]'),'payments',coalesce((select jsonb_agg(to_jsonb(p)) from public.payment_records p join public.bookings b on b.id=p.booking_id where b.customer_id=r.customer_id),'[]')) into result;
   perform private.log(null,'privacy_export',jsonb_build_object('request_id',r.id,'customer_id',r.customer_id));return result;
  end if;
  if p_action<>'update' then raise exception 'Invalid privacy action';end if;
  if r.revision is distinct from (p_data->>'revision')::integer then raise exception 'Request changed. Reload first.' using errcode='40001';end if;
  next_status=p_data->>'status';
  if next_status not in('received','verified','reviewed','completed','declined') then raise exception 'Invalid status';end if;
  if next_status in('verified','reviewed','completed') and r.identity_verified_at is null and not coalesce((p_data->>'identity_verified')::boolean,false) then raise exception 'Verify requester identity first';end if;
  if next_status='completed' and length(trim(coalesce(p_data->>'notes','')))<10 then raise exception 'Record the result and any retained records';end if;
  update private.privacy_requests set status=next_status,notes=coalesce(p_data->>'notes',notes),identity_verified_at=case when coalesce((p_data->>'identity_verified')::boolean,false) then coalesce(identity_verified_at,now()) else identity_verified_at end,updated_at=now(),revision=revision+1 where id=r.id returning * into r;
 end if;
 perform private.log(null,'privacy_'||p_action,jsonb_build_object('request_id',r.id,'status',r.status));return to_jsonb(r);
end$$;
revoke all on function public.api_privacy(text,jsonb) from public,anon;
grant execute on function public.api_privacy(text,jsonb) to authenticated;
commit;
