-- Private owner read receipts. Existing customer permissions do not change.
begin;
create table private.admin_notice_reads(owner_id uuid not null references auth.users(id),event_id uuid not null references public.audit_events(id),read_at timestamptz not null default now(),primary key(owner_id,event_id));
alter table private.admin_notice_reads enable row level security;
create or replace function public.api_owner_attention(p_read_ids uuid[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 if cardinality(p_read_ids)>100 then raise exception 'Too many notices' using errcode='22023';end if;
 insert into private.admin_notice_reads(owner_id,event_id) select auth.uid(),id from public.audit_events where id=any(p_read_ids) and action in('booking_created','accept_quote') on conflict do nothing;
 with candidates as (
  select e.id,e.booking_id,e.created_at,c.name customer_name,b.visit_date,b.service,
   case e.action when 'booking_created' then 'booking' when 'walkthrough_uploaded' then 'walkthrough' else 'approval' end kind,
   row_number() over(partition by e.booking_id,e.action order by e.created_at desc,e.id) rank
  from public.audit_events e join public.bookings b on b.id=e.booking_id join public.customers c on c.id=b.customer_id
  where b.status not in('cancelled','completed') and
   ((e.action='booking_created' and e.details->>'source'='customer' and b.status in('requested','awaiting_walkthrough')) or
    (e.action='walkthrough_uploaded' and not b.reviewed and exists(select 1 from public.walkthrough_files f where f.booking_id=b.id and f.status='ready' and f.purpose='walkthrough')) or
    (e.action='accept_quote' and b.quote_status='accepted'))
 ), notices as(select * from candidates n where rank=1 and not exists(select 1 from private.admin_notice_reads r where r.owner_id=auth.uid() and r.event_id=n.id))
 select jsonb_build_object('counts',jsonb_build_object('booking',count(*) filter(where kind='booking'),'walkthrough',count(*) filter(where kind='walkthrough'),'approval',count(*) filter(where kind='approval')),'items',coalesce((select jsonb_agg(to_jsonb(x)-'rank'-'category_rank') from (select * from (select notices.*,row_number() over(partition by kind order by created_at desc,id) category_rank from notices) ranked where category_rank<=100 order by created_at desc,id) x),'[]')) into result from notices;
 return result;
end $$;
revoke all on function public.api_owner_attention(uuid[]) from public,anon;
grant execute on function public.api_owner_attention(uuid[]) to authenticated;
commit;
