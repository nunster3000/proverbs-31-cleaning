-- Extend the existing owner signature presets; stored form versions are unchanged.
begin;
create or replace function private.valid_agreement_configuration(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare q jsonb;seen text[]='{}';o jsonb;core_count integer=0;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>24000 or p->>'representative_style' is null or p->>'representative_style' not in('classic','modern','formal','allura','greatvibes','parisienne') or jsonb_typeof(p->'questions') is distinct from 'array' or jsonb_array_length(p->'questions') not between 3 and 20 then return false;end if;
 if exists(select 1 from jsonb_object_keys(p) k where k not in('representative_style','questions')) then return false;end if;
 for q in select value from jsonb_array_elements(p->'questions') loop
  if jsonb_typeof(q)<>'object' or exists(select 1 from jsonb_object_keys(q) k where k not in('id','label','type','required','step','options')) then return false;end if;
  if jsonb_typeof(q->'label') is distinct from 'string' or q->>'id' is null or q->>'id'=any(seen) or q->>'id' !~ '^(client_name|phone|entry_method|entry_instructions|security_notes|pets_safety|property_care|emergency_contact|other_services|q_[a-z0-9]{8,32})$' or length(trim(coalesce(q->>'label',''))) not between 1 and 160 or q->>'type' is null or q->>'type' not in('text','long','choice','yesno') or jsonb_typeof(q->'required') is distinct from 'boolean' or q->>'step' is null or q->>'step' not in('0','1') then return false;end if;
  seen=array_append(seen,q->>'id');
  if q->>'id' in('client_name','phone') then
   if q->>'type'<>'text' or q->>'step'<>'0' or q->'required'<>'true'::jsonb then return false;end if;core_count=core_count+1;
  elsif q->>'id'='entry_method' then
   if q->>'type'<>'choice' or q->>'step'<>'1' or q->'required'<>'true'::jsonb or q->'options' is distinct from '["I will be present","Key handoff","Lockbox or keypad","Other arrangement"]'::jsonb then return false;end if;core_count=core_count+1;
  elsif q->>'step'<>'1' then return false;end if;
  if q->>'type'='choice' then
   if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 2 and 8 then return false;end if;
   for o in select value from jsonb_array_elements(q->'options') loop
    if jsonb_typeof(o)<>'string' or length(trim(o#>>'{}')) not between 1 and 100 then return false;end if;
   end loop;
   if (select count(*) from jsonb_array_elements(q->'options'))<>(select count(distinct value) from jsonb_array_elements(q->'options')) then return false;end if;
  elsif q ? 'options' then return false;end if;
 end loop;
 return core_count=3;
end $$;
commit;
