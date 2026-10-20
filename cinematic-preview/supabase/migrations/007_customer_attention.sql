-- Only verified account customers can read their own attention items.
begin;
create table private.customer_notice_reads(user_id uuid not null references auth.users(id),event_id uuid not null references public.audit_events(id),read_at timestamptz not null default now(),primary key(user_id,event_id));
alter table private.customer_notice_reads enable row level security;
create function public.api_customer_attention(p_read_ids uuid[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.account_user() then raise exception 'Verified account required' using errcode='42501';end if;
 if cardinality(p_read_ids)>100 then raise exception 'Too many notices' using errcode='22023';end if;
 insert into private.customer_notice_reads(user_id,event_id) select auth.uid(),e.id from public.audit_events e join public.bookings b on b.id=e.booking_id join public.customers c on c.id=b.customer_id where e.id=any(p_read_ids) and e.action='review' and c.auth_user_id=auth.uid() and c.account_enabled on conflict do nothing;
 with owned as(select b.* from public.bookings b join public.customers c on c.id=b.customer_id where c.auth_user_id=auth.uid() and c.account_enabled and b.status<>'cancelled'),
 notices as(
  select e.id,b.id booking_id,'review'::text kind,b.service,b.visit_date,e.created_at,null::integer amount_cents from owned b join lateral(select id,created_at from public.audit_events where booking_id=b.id and action='review' order by created_at desc,id limit 1) e on true where b.reviewed and not exists(select 1 from private.customer_notice_reads r where r.user_id=auth.uid() and r.event_id=e.id)
  union all
  select b.id,b.id,'approval',b.service,b.visit_date,b.created_at,b.final_cents from owned b where b.quote_status='awaiting_approval'
  union all
  select b.id,b.id,'payment',b.service,b.visit_date,b.created_at,b.final_cents-b.deposit_paid_cents-b.final_paid_cents from owned b where b.invoice_issued and b.final_cents is not null and b.final_cents>b.deposit_paid_cents+b.final_paid_cents
 )
 select jsonb_build_object('counts',jsonb_build_object('review',count(*) filter(where kind='review'),'approval',count(*) filter(where kind='approval'),'payment',count(*) filter(where kind='payment')),'items',coalesce((select jsonb_agg(to_jsonb(x)-'category_rank') from(select * from(select notices.*,row_number() over(partition by kind order by created_at desc,id) category_rank from notices) ranked where category_rank<=100) x),'[]')) into result from notices;
 return result;
end $$;
revoke all on function public.api_customer_attention(uuid[]) from public,anon;
grant execute on function public.api_customer_attention(uuid[]) to authenticated;
commit;
