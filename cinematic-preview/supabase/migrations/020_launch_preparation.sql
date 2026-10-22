-- Owner-managed launch approvals and public policy copy. Never toggles authentication or delivery.
begin;
create table private.launch_preparation(id boolean primary key default true check(id),revision integer not null default 0,draft jsonb not null default '{}'::jsonb,published jsonb,published_revision integer,published_at timestamptz,approved_by uuid references auth.users(id),content_revision integer,pricing_fingerprint text,operations jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now());
insert into private.launch_preparation(id) values(true);
alter table private.launch_preparation enable row level security;
revoke all on private.launch_preparation from public,anon,authenticated;
alter table public.access_forms add column policy_revision integer,add column policy_content jsonb;
create function private.access_form_policy_revision() returns trigger language plpgsql security definer set search_path='' as $$begin select published_revision,published into new.policy_revision,new.policy_content from private.launch_preparation where id=true;return new;end$$;
create trigger access_form_policy_revision before insert on public.access_forms for each row execute function private.access_form_policy_revision();
create function private.launch_pricing_fingerprint() returns text language sql stable security definer set search_path='' as $$select md5(jsonb_build_object('spaces',(select jsonb_agg(to_jsonb(s) order by id) from public.service_spaces s),'services',(select jsonb_agg(to_jsonb(s) order by id) from public.service_types s),'addons',(select jsonb_agg(to_jsonb(a) order by id) from public.service_addons a))::text)$$;
create function public.api_public_policies() returns jsonb language sql stable security definer set search_path='' as $$select case when published is null then null else jsonb_build_object('content',published,'revision',published_revision,'published_at',published_at) end from private.launch_preparation where id=true$$;
create function public.api_launch_preparation(p_action text default 'read',p_data jsonb default '{}',p_expected integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.launch_preparation; k text;v jsonb;f public.access_forms; current_content integer;current_prices text;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 select * into r from private.launch_preparation where id=true for update;
 select revision into current_content from public.site_content where id=true;current_prices=private.launch_pricing_fingerprint();
 if p_action<>'read' then
  if p_expected is null or p_expected<>r.revision then raise exception 'Launch preparation changed. Reload before saving.' using errcode='40001';end if;
  if p_action in('save_policies','publish_policies') then
   if jsonb_typeof(p_data->'content') is distinct from 'object' or octet_length((p_data->'content')::text)>40000 then raise exception 'Provide policy text' using errcode='22023';end if;
   for k,v in select * from jsonb_each(p_data->'content') loop
    if k not in('payment_due','cancellation_notice','deposit_handling','privacy_notice','media_retention','customer_retention','privacy_requests','service_exclusions','access_issues','damage_contact','recurring_terms') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>5000 then raise exception 'Invalid policy field' using errcode='22023';end if;
   end loop;
   if p_action='publish_policies' then
    if coalesce((p_data->>'approved')::boolean,false)=false then raise exception 'Business approval is required before publication' using errcode='22023';end if;
    foreach k in array array['payment_due','cancellation_notice','deposit_handling','privacy_notice','media_retention','customer_retention','privacy_requests','service_exclusions','access_issues','damage_contact','recurring_terms'] loop
     if length(trim(coalesce(p_data->'content'->>k,'')))<5 then raise exception 'Complete policy: %',k using errcode='22023';end if;
    end loop;
   end if;
   update private.launch_preparation set draft=p_data->'content',published=case when p_action='publish_policies' then p_data->'content' else published end,published_revision=case when p_action='publish_policies' then revision+1 else published_revision end,published_at=case when p_action='publish_policies' then now() else published_at end,approved_by=case when p_action='publish_policies' then auth.uid() else approved_by end where id=true;
  elsif p_action='approve_content' then
   if p_data->>'revision' is distinct from current_content::text or coalesce((p_data->>'approved')::boolean,false)=false then raise exception 'Review current website content before approval' using errcode='40001';end if;
   update private.launch_preparation set content_revision=current_content where id=true;
  elsif p_action='approve_pricing' then
   if p_data->>'fingerprint' is distinct from current_prices or coalesce((p_data->>'approved')::boolean,false)=false then raise exception 'Review current pricing before approval' using errcode='40001';end if;
   update private.launch_preparation set pricing_fingerprint=current_prices where id=true;
  elsif p_action='save_operations' then
   if jsonb_typeof(p_data->'operations') is distinct from 'object' then raise exception 'Provide operations preferences' using errcode='22023';end if;
   for k,v in select * from jsonb_each(p_data->'operations') loop
    if k not in('backup_preference','recovery_contact','owner_notes','iphone_check','android_check','handover_check','provider_recovery') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'Invalid operations field' using errcode='22023';end if;
   end loop;
   if coalesce(p_data->'operations'->>'backup_preference','') not in('','provider_managed','encrypted_external','discuss') then raise exception 'Choose a backup preference' using errcode='22023';end if;
   foreach k in array array['iphone_check','android_check','handover_check','provider_recovery'] loop
    if coalesce(p_data->'operations'->>k,'not_checked') not in('not_checked','passed','needs_help') then raise exception 'Choose an owner check result' using errcode='22023';end if;
   end loop;
   update private.launch_preparation set operations=p_data->'operations' where id=true;
  else raise exception 'Invalid launch action' using errcode='22023';end if;
  update private.launch_preparation set revision=revision+1,updated_at=now() where id=true returning * into r;
  perform private.log(null,'launch_'||p_action,jsonb_build_object('revision',r.revision));
 end if;
 select * into f from public.access_forms where active;
 return to_jsonb(r)-'id'||jsonb_build_object('current_content_revision',current_content,'current_pricing_fingerprint',current_prices,'content_approved',r.content_revision=current_content,'pricing_approved',r.pricing_fingerprint=current_prices,'agreement_ready',f.id is not null and f.automatic_representative and f.policy_revision=r.published_revision and r.published_revision is not null,'agreement_form_id',f.id,'policies_current',r.published is not null and r.draft=r.published,'content',(select to_jsonb(c) from public.site_content c where id=true));
end$$;
-- New agreements use approved policy text. Existing signed snapshots never change.
create or replace function private.agreement_details(b public.bookings) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('business_name','Proverbs 31 Cleaning Services','business_email',c.contact_email,'business_phone',c.contact_phone,'client_name',b.property->>'name','client_email',b.property->>'email','client_phone',b.property->>'phone','service',b.service,'apartment_mode',b.apartment_mode,'focus',b.focus,'extras',b.extras,'included',b.quote_snapshot,'starting_cents',b.quote_snapshot->'total_cents','agreed_cents',case when b.quote_status='accepted' then b.final_cents else null end,'quote_status',b.quote_status,'deposit_paid_cents',b.deposit_paid_cents,'recurrence',b.recurrence,'visit',private.access_visit(b),'payment_due',coalesce((case when f.id is not null then f.policy_content else l.published end)->>'payment_due','To be agreed with Gabrielle'),'cancellation_notice',coalesce((case when f.id is not null then f.policy_content else l.published end)->>'cancellation_notice','To be agreed with Gabrielle'),'policy_revision',case when f.id is not null then f.policy_revision else l.published_revision end,'policy_snapshot',case when f.id is not null then f.policy_content else l.published end) from public.site_content c cross join private.launch_preparation l left join public.access_forms f on f.id=b.access_form_id or (b.access_form_id is null and f.active) where c.id=true and l.id=true limit 1
$$;
revoke all on function private.access_form_policy_revision(),private.launch_pricing_fingerprint() from public,anon,authenticated;
revoke all on function public.api_launch_preparation(text,jsonb,integer) from public,anon;
grant execute on function public.api_launch_preparation(text,jsonb,integer) to authenticated;
revoke all on function public.api_public_policies() from public;
grant execute on function public.api_public_policies() to anon,authenticated;
commit;
