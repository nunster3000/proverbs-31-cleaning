# Auth configuration mismatch — October 22, 2026

## Scope and protection

Business Supabase project: `mokhzraxcbrmzpvedhxz` (Proverbs 31 Cleaning Services), production/main, us-west-2. The website countdown stays enabled until October 26, 2026 at 09:00 America/New_York (13:00 UTC). No website gate, RLS, roles, keys, passwords or customer data changed during investigation. No sign-in email was sent.

## Evidence

- A fresh Supabase dashboard load shows Email ENABLED, Allow new users to sign up ON, Confirm email ON, anonymous sign-ins OFF. These were explicitly authorized by the user.
- Direct GET `/auth/v1/settings` returns HTTP 200 but `external.email=false`, `disable_signup=true`, `mailer_autoconfirm=false`.
- Response header `sb-project-ref` equals the dashboard project reference. The project's Auth log stream contains matching `/settings` requests at the same times. This rules out a different project or a request that never reached this Auth service.
- Uncached requests and query variations returned the same values. The gateway response reports `cf-cache-status: DYNAMIC`.
- The source implementation of Supabase Auth's settings endpoint reports the running service configuration (`a.config`), not website state: https://github.com/supabase/auth/blob/master/internal/api/settings.go
- Application source contains no writes to Supabase Management Auth configuration. Vercel's application-level AUTH_ENABLED/launch flags do not change the Supabase provider settings.
- The Auth log stream had no reload/restart/startup entries around the dashboard saves; successful settings/admin GETs were present.
- Supabase status and dashboard reported an ongoing API gateway technical issue. The relationship to this project is not confirmed: https://status.supabase.com/

## Recovery attempt

A full project restart was submitted from Settings → General at approximately 17:27 UTC (13:27 Eastern). The confirmation warns of a few minutes of downtime. This was chosen after matching project identity/logs to force the service to load saved configuration; no database-only reboot, pause, reset, key rotation or deletion was performed.

At 17:31 UTC, the dashboard still showed Restarting and the Auth endpoint still returned the old settings. No second restart was submitted. Configuration delivery/recovery within Supabase is the suspected failure boundary; the internal cause requires provider investigation if the restart does not reconcile it.

## Resolution

At 17:32:29 UTC (13:32 Eastern), the project dashboard returned Healthy and the live Auth endpoint returned `external.email=true`, `disable_signup=false`, `mailer_autoconfirm=false`, anonymous users false. The restart reconciled the saved dashboard and running Auth configuration. The observed failure was stale runtime configuration; its deeper platform cause is not proven. No support message was sent. The website countdown remained active for October 26 at 09:00 Eastern throughout.

## Historical support draft — resolved, not sent

Our production project `mokhzraxcbrmzpvedhxz` has persisted dashboard Auth settings Email enabled and new-user registration allowed, but the running Auth settings endpoint returns email disabled and signup disabled. A fresh dashboard session confirms the saved values. Response project-ref and matching Auth logs confirm the request reaches this exact project. Repeated uncached requests return HTTP 200 with the old runtime configuration. A full project restart submitted around 2026-10-22 17:27 UTC remains pending as of 17:31 UTC. Please investigate saved Auth configuration propagation and the pending project restart. We have not changed database schema, RLS, customer records, keys or website launch protections during this investigation.

Useful request reference: `01a164a5-8413-76cd-8a94-bce193c08e6b` (GET settings at 17:25:31 UTC). Do not include API keys, auth links, credentials or customer data in the ticket.
