-- Run only in the Supabase SQL Editor after this person has signed in and verified their email.
-- Replace the placeholder. Do not grant owners based on browser metadata or a submitted role field.
insert into private.owner_accounts(user_id)
select id from auth.users
where lower(email)=lower('REPLACE_WITH_OWNER_EMAIL') and email_confirmed_at is not null
on conflict(user_id) do nothing
returning user_id;
-- Exactly one returned user ID is expected for a new owner. Reload the workspace afterward.
