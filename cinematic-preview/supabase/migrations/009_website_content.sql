-- Public business information only. Customer records and walkthrough media stay private.
begin;
create table public.site_content(
 id boolean primary key default true check(id),
 company_intro text not null default 'Thoughtful care for the spaces where life happens. Proverbs 31 Cleaning Co. helps make home feel welcoming, refreshed, and ready for you.' check(length(company_intro) between 1 and 3000),
 founder_name text not null default 'Gabrielle Jackson' check(length(founder_name) between 1 and 120),
 founder_bio text not null default '' check(length(founder_bio)<=5000),
 contact_intro text not null default 'Tell us about your space, the care you need, and your preferred visit date.' check(length(contact_intro) between 1 and 2000),
 contact_email text not null default 'gabriellejackson@proverbs31cleaningcoservices.info' check(length(contact_email)<=254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 contact_phone text not null default '' check(length(contact_phone)<=40 and contact_phone ~ '^[0-9+(). -]*$'),
 service_area text not null default 'Serving Atlanta and surrounding areas.' check(length(service_area) between 1 and 500),
 service_area_note text not null default 'Gabrielle reviews each requested address and confirms whether service is available based on distance.' check(length(service_area_note) between 1 and 1000),
 photo_path text check(photo_path ~ '^owner/[0-9a-f-]{36}\.(jpg|png|webp)$'),
 revision integer not null default 1,updated_at timestamptz not null default now()
);
insert into public.site_content(id) values(true);
alter table public.site_content enable row level security;
revoke all on public.site_content from public,anon,authenticated;
grant select on public.site_content to anon,authenticated;
create policy business_information_read on public.site_content for select to anon,authenticated using(true);
create function public.api_owner_content(p_data jsonb,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_row public.site_content;next_path text;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 select * into current_row from public.site_content where id=true for update;
 if p_expected is null or p_expected<>current_row.revision then raise exception 'Website content changed. Reload it before saving.' using errcode='22023';end if;
 next_path=case when p_data ? 'photo_path' then nullif(p_data->>'photo_path','') else current_row.photo_path end;
 if next_path is not null and not exists(select 1 from storage.objects where bucket_id='site-media' and name=next_path) then raise exception 'Upload the public company photo first' using errcode='22023';end if;
 update public.site_content set company_intro=coalesce(p_data->>'company_intro',company_intro),founder_name=coalesce(p_data->>'founder_name',founder_name),founder_bio=coalesce(p_data->>'founder_bio',founder_bio),contact_intro=coalesce(p_data->>'contact_intro',contact_intro),contact_email=coalesce(p_data->>'contact_email',contact_email),contact_phone=coalesce(p_data->>'contact_phone',contact_phone),service_area=coalesce(p_data->>'service_area',service_area),service_area_note=coalesce(p_data->>'service_area_note',service_area_note),photo_path=next_path,revision=revision+1,updated_at=now() where id=true returning * into current_row;
 perform private.log(null,'website_content_updated',jsonb_build_object('revision',current_row.revision));
 return to_jsonb(current_row);
end $$;
revoke all on function public.api_owner_content(jsonb,integer) from public,anon;
grant execute on function public.api_owner_content(jsonb,integer) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('site-media','site-media',true,2097152,array['image/jpeg','image/png','image/webp']);
-- No customer upload policies: only the verified owner API may upload business photos.
commit;
