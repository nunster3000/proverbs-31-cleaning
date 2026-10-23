-- Business-supplied policy draft. No publication, refunds, fees or signed-record changes.
begin;
create or replace function public.api_launch_preparation(p_action text default 'read',p_data jsonb default '{}',p_expected integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
    if k not in('payment_due','cancellation_notice','deposit_handling','privacy_notice','media_retention','customer_retention','privacy_requests','service_exclusions','access_issues','damage_contact','recurring_terms','emergency_appointments') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>5000 then raise exception 'Invalid policy field' using errcode='22023';end if;
   end loop;
   if p_action='publish_policies' then
    if coalesce((p_data->>'approved')::boolean,false)=false then raise exception 'Business approval is required before publication' using errcode='22023';end if;
    foreach k in array array['payment_due','cancellation_notice','deposit_handling','privacy_notice','media_retention','customer_retention','privacy_requests','service_exclusions','access_issues','damage_contact','recurring_terms','emergency_appointments'] loop
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

update private.launch_preparation set draft=draft||$policy${"payment_due":"A deposit is required to secure your cleaning appointment. All appointments are subject to availability. The timing of the remaining service balance is to be agreed with Gabrielle.","cancellation_notice":"To receive a deposit refund, cancel at least 72 hours before your scheduled appointment start time. Cancellations received less than 72 hours before the scheduled start time are not eligible for a deposit refund. For rescheduling requests or an emergency affecting an existing appointment, contact Proverbs 31 Cleaning Co. as soon as possible. Deposit handling for a rescheduled appointment is subject to Gabrielle’s review.","deposit_handling":"Your deposit will be refunded if you cancel at least 72 hours before your scheduled appointment start time. If you cancel less than 72 hours before the scheduled start time, Proverbs 31 Cleaning Co. will retain your deposit. Deposits secure your appointment and reserve your scheduled time.","emergency_appointments":"Same-day emergency cleaning requests may be accommodated when availability permits and are not guaranteed. A $75 emergency scheduling fee applies to approved same-day emergency appointments, in addition to the regular cleaning service cost and any required deposit. Payment arrangements for the emergency fee must be confirmed before the appointment is secured. By booking, you acknowledge the scheduling, cancellation, deposit and emergency appointment policies. “Let all things be done decently and in order.” — 1 Corinthians 14:40"}$policy$::jsonb,revision=revision+1,updated_at=now() where id=true;
commit;
