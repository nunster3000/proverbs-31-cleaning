begin;
create table public.access_forms(id uuid primary key default gen_random_uuid(),title text not null check(length(title) between 3 and 160),body text not null check(length(body) between 40 and 30000),active boolean not null default true,created_at timestamptz not null default now());
create unique index access_forms_one_active on public.access_forms(active) where active;
create table public.access_signatures(id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),form_id uuid not null references public.access_forms(id),signer_id uuid not null references auth.users(id),signer_name text not null check(length(signer_name) between 3 and 120),signed_at timestamptz not null default now(),visit_snapshot jsonb not null,consent jsonb not null,unique(booking_id,form_id,visit_snapshot));
alter table public.bookings add column access_form_id uuid references public.access_forms(id),add column access_signed_at timestamptz;
alter table public.access_forms enable row level security;
alter table public.access_signatures enable row level security;
create function public.access_form_access(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.account_user() and (public.is_owner() or exists(select 1 from public.access_forms where id=p_id and active) or exists(select 1 from public.access_signatures where form_id=p_id and signer_id=auth.uid())) $$;
create policy access_form_read on public.access_forms for select to authenticated using(public.access_form_access(id));
create policy access_signature_read on public.access_signatures for select to authenticated using(public.is_owner() or public.booking_access(booking_id));
grant select on public.access_forms,public.access_signatures to authenticated;
create function private.access_visit(b public.bookings) returns jsonb language sql immutable set search_path='' as $$ select jsonb_build_object('date',b.visit_date,'arrival',b.arrival,'address',b.property->'address','unit',b.property->'unit','city',b.property->'city','state',b.property->'state','zip',b.property->'zip') $$;
create function public.api_access_form(p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings; f public.access_forms; receipt jsonb;
begin
 if not private.account_user() then raise exception 'Verified account required' using errcode='42501';end if;
 if p_id is not null then
  select * into b from public.bookings where id=p_id;
  if not found or not(public.is_owner() or private.owns_booking(p_id)) then raise exception 'Booking not accessible' using errcode='42501';end if;
  select to_jsonb(s) || jsonb_build_object('form',to_jsonb(a)) into receipt from public.access_signatures s join public.access_forms a on a.id=s.form_id where s.booking_id=p_id and s.visit_snapshot=private.access_visit(b) order by s.signed_at desc limit 1;
  if b.access_form_id is not null then select * into f from public.access_forms where id=b.access_form_id;else select * into f from public.access_forms where active;end if;
 elsif public.is_owner() then select * into f from public.access_forms where active;
 else raise exception 'Owner required' using errcode='42501';end if;
 return jsonb_build_object('form',case when f.id is null then null else to_jsonb(f) end,'receipt',receipt,'visit',case when p_id is null then null else private.access_visit(b) end);
end $$;
create function public.api_publish_access_form(p_title text,p_body text,p_previous uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_id uuid; result public.access_forms;
begin
 if not public.is_owner() then raise exception 'Owner required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(73131011);
 select id into current_id from public.access_forms where active;
 if current_id is distinct from p_previous then raise exception 'Form changed; reload before publishing' using errcode='40001';end if;
 update public.access_forms set active=false where active;
 insert into public.access_forms(title,body) values(trim(p_title),trim(p_body)) returning * into result;
 perform private.log(null,'access_form_published',jsonb_build_object('form_id',result.id));
 return to_jsonb(result);
end $$;
create function public.api_sign_access(p_id uuid,p_form uuid,p_visit jsonb,p_name text,p_consent boolean,p_electronic boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings; f public.access_forms; result public.access_signatures;
begin
 if not private.account_user() or not private.owns_booking(p_id) then raise exception 'Only this booking customer can sign' using errcode='42501';end if;
 select * into b from public.bookings where id=p_id for update;
 if b.status<>'confirmed' then raise exception 'Sign after the booking is confirmed and before travel' using errcode='22023';end if;
 if not coalesce(p_consent,false) or not coalesce(p_electronic,false) then raise exception 'Both acknowledgements are required' using errcode='22023';end if;
 select * into f from public.access_forms where id=p_form and (id=b.access_form_id or (b.access_form_id is null and active));
 if not found or p_visit is distinct from private.access_visit(b) then raise exception 'Form or visit changed; review again' using errcode='40001';end if;
 insert into public.access_signatures(booking_id,form_id,signer_id,signer_name,visit_snapshot,consent) values(p_id,f.id,auth.uid(),trim(p_name),p_visit,jsonb_build_object('permission',true,'electronic_signature',true)) on conflict(booking_id,form_id,visit_snapshot) do nothing returning * into result;
 if result.id is null then select * into result from public.access_signatures where booking_id=p_id and form_id=f.id and visit_snapshot=p_visit;end if;
 update public.bookings set access_form_id=f.id,access_signed_at=result.signed_at where id=p_id;
 perform private.log(p_id,'access_authorization_signed',jsonb_build_object('signature_id',result.id,'form_id',f.id));
 return to_jsonb(result);
end $$;
create function private.enforce_access_authorization() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.access_visit(new) is distinct from private.access_visit(old) then new.access_signed_at=null;end if;
 if new.status='confirmed' and new.access_form_id is null then select id into new.access_form_id from public.access_forms where active;end if;
 if new.status='on_the_way' and old.status<>'on_the_way' and (new.access_signed_at is null or not exists(select 1 from public.access_signatures s where s.booking_id=new.id and s.form_id=new.access_form_id and s.visit_snapshot=private.access_visit(new))) then raise exception 'Customer home-access authorization must be signed before On the way' using errcode='22023';end if;
 return new;
end $$;
create trigger enforce_access_authorization before update on public.bookings for each row execute function private.enforce_access_authorization();
revoke all on function public.access_form_access(uuid),public.api_access_form(uuid),public.api_publish_access_form(text,text,uuid),public.api_sign_access(uuid,uuid,jsonb,text,boolean,boolean) from public,anon;
grant execute on function public.access_form_access(uuid),public.api_access_form(uuid),public.api_publish_access_form(text,text,uuid),public.api_sign_access(uuid,uuid,jsonb,text,boolean,boolean) to authenticated;
create or replace function public.api_customer_attention(p_read_ids uuid[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.account_user() then raise exception 'Verified account required' using errcode='42501';end if;
 if cardinality(p_read_ids)>100 then raise exception 'Too many notices' using errcode='22023';end if;
 insert into private.customer_notice_reads(user_id,event_id) select auth.uid(),e.id from public.audit_events e join public.bookings b on b.id=e.booking_id join public.customers c on c.id=b.customer_id where e.id=any(p_read_ids) and e.action in('review','request_reviewed') and c.auth_user_id=auth.uid() and c.account_enabled on conflict do nothing;
 with owned as(select b.* from public.bookings b join public.customers c on c.id=b.customer_id where c.auth_user_id=auth.uid() and c.account_enabled),
 notices as(
 select b.id,b.id booking_id,'access'::text kind,b.service,b.visit_date,b.created_at,null::integer amount_cents from owned b where b.status='confirmed' and b.access_signed_at is null
 union all
  select e.id,b.id booking_id,'review'::text kind,b.service,b.visit_date,e.created_at,null::integer amount_cents from owned b join lateral(select id,created_at from public.audit_events where booking_id=b.id and action='review' order by created_at desc,id limit 1) e on true where b.status<>'cancelled' and b.reviewed and not exists(select 1 from private.customer_notice_reads r where r.user_id=auth.uid() and r.event_id=e.id)
  union all
  select b.id,b.id,'approval',b.service,b.visit_date,b.created_at,b.final_cents from owned b where b.status<>'cancelled' and b.quote_status='awaiting_approval'
  union all
  select b.id,b.id,'payment',b.service,b.visit_date,b.created_at,b.final_cents-b.deposit_paid_cents-b.final_paid_cents from owned b where b.status<>'cancelled' and b.invoice_issued and b.final_cents is not null and b.final_cents>b.deposit_paid_cents+b.final_paid_cents
 union all
  select e.id,b.id,'change',b.service,b.visit_date,e.created_at,null::integer from owned b join public.audit_events e on e.booking_id=b.id and e.action='request_reviewed' where not exists(select 1 from private.customer_notice_reads r where r.user_id=auth.uid() and r.event_id=e.id)
 )
 select jsonb_build_object('counts',jsonb_build_object('access',count(*) filter(where kind='access'),'review',count(*) filter(where kind='review'),'approval',count(*) filter(where kind='approval'),'payment',count(*) filter(where kind='payment'),'change',count(*) filter(where kind='change')),'items',coalesce((select jsonb_agg(to_jsonb(x)-'category_rank') from(select * from(select notices.*,row_number() over(partition by kind order by created_at desc,id) category_rank from notices) ranked where category_rank<=100) x),'[]')) into result from notices;
 return result;
end $$;
commit;
