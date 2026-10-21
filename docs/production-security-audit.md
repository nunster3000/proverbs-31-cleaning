# Production security and configuration audit

Reviewed October 20, 2026 (America/New_York). Target: https://www.proverbs31cleaningcoservices.info, business Vercel project `proverbs-31-cleaning-co/proverbs-31-cleaning`, Supabase project `mokhzraxcbrmzpvedhxz`.

## Assessment

The reviewed access controls are in place and the launch gates remain closed. This is a scoped configuration/code review and regression check, not a penetration-test certification. Do not enable registration solely on the basis of this report. Hosted customer/admin session tests, email delivery, recovery arrangements, and owner assignment are still launch gates.

## Verified against production

- Backend connected; application AUTH, guest checkout, and private guest portal flags all false. Private account, owner-state and guest-view HTTP endpoints return 503 while unavailable, with `Cache-Control: no-store`.
- Supabase Auth independently reports email, anonymous, phone and external providers disabled, signup disabled, and automatic email confirmation disabled. The API flag is not the only barrier.
- Site URL is exactly the canonical business domain. The redirect allowlist contains only `https://www.proverbs31cleaningcoservices.info/sign-in.html`, with no wildcard, localhost, preview or personal-project redirects.
- Canonical-origin guest exchange reaches the disabled-feature gate (503); a foreign origin is rejected (403). No link was redeemed and no email was sent by these probes.
- Direct anonymous REST reads of customers, bookings, media metadata, payments, owner notes, audit events and access signatures return permission denied (401/42501). Bucket enumeration exposes no buckets to the anonymous caller.
- Read-only SQL inventory: every public table has RLS; authenticated users have no direct INSERT/UPDATE/DELETE table grants; private schema usage is denied to anon/authenticated; every public/private SECURITY DEFINER function has a pinned empty search path. The only anonymous executable public functions are `api_quote` and `api_availability`.
- Private walkthrough bucket: `public=false`, 20 MiB limit, JPG/PNG/WebP/MP4/WebM/MOV allowlist. Separate public `site-media` bucket: company photos only, 2 MiB, JPG/PNG/WebP. Public business photography is intentional; customer media belongs only in the private bucket.
- Hosted inventory currently contains zero bookings, zero guest grants, zero published access forms, and zero website owner assignments. No QA booking, guest grant or form was created for this audit.
- Supabase Security Advisor: zero errors, 25 warnings. Reviewed warnings concern deliberately callable SECURITY DEFINER functions (two public read functions and authenticated scoped/owner functions); they are not proof of unrestricted access. Internal role/ownership checks and pinned paths must remain covered by regression tests. Warnings were not suppressed.
- TLS/HSTS, nosniff and noindex/nofollow already present. Environment file, server source, local QA server and retired admin store probes return 404.
- Vercel environment inventory places the service-role key in a secret, Production-only variable. Production credentials are not configured in Preview/Development in this business project. Do not add them to a public bundle or copy them into the personal portfolio deployment.
- Production dependency audit: zero known vulnerabilities at audit time (`npm audit --omit=dev`). This is a registry advisory check, not proof that dependencies contain no defects.

## Hardening implemented during audit

- Added `X-Frame-Options: SAMEORIGIN` and CSP `frame-ancestors 'self'` to prevent foreign sites framing the app while retaining same-origin mobile QA wrappers.
- Added CSP `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. This is baseline document hardening, not a full script-source/XSS policy; existing inline application scripts remain compatible.
- Disabled unused geolocation, microphone, browser payment and USB capabilities through Permissions-Policy. File selection and photo/video uploads remain available.
- Added `no-store` and `no-referrer` to account/admin/workspace/guest/sign-in page shells. API responses already use those protections. Guest fragment secrets are removed before normal page operation; guest cookie is Secure/HttpOnly/SameSite=Strict in production.
- Added regression checks for framing/CSP protections and private-page cache/referrer coverage. Documented the separate disabled guest-portal environment flag.

## Required before enabling access

1. **Website admin:** There are currently no rows in `private.owner_accounts`. After the intended administrator verifies their account, use the reviewed bootstrap SQL to assign that exact identity. Existing Vercel/Supabase membership does not confer website admin access. Do not grant a role based on browser metadata or a form field. Gabrielle's final admin assignment and removal of temporary developer access require verification at handoff.
2. **Backup and recovery:** The hosted Backups page explicitly states the Free Plan does not include project backups. Choose an owner-approved paid backup option or a secured external export/restore process, and test recovery. A database dump does not by itself back up storage object bytes. Do not describe the current project as backed up.
3. **Authentication abuse controls:** CAPTCHA currently off. Before public sign-in, configure the matching Turnstile secret/site key in Supabase/application and validate the existing CAPTCHA flow. Keep email/anonymous providers disabled until sender and abuse controls are tested. Current limits include 2 emails/hour without custom SMTP, 30 verifications/5 minutes/IP, and 30 sign-ins/signups/5 minutes/IP; recheck sender limits and per-user cooldown during Resend setup.
4. **Real hosted sessions:** With controlled verified test accounts, repeat customer A/customer B/admin isolation, private uploads, storage signed URL expiry, role denial, sign-out, and simultaneous calendar booking conflict tests against the hosted stack. Current cross-customer and conflict regression tests use an isolated SQL environment. One optional native PostgreSQL concurrency test remains skipped without its QA database.
5. **Operational readiness:** Confirm business-owned provider access, MFA/recovery ownership for provider accounts, error/availability monitoring, and who responds to incidents. These provider-account ownership/recovery controls were not independently verified by this audit.
6. **Retention/policy:** Approve retention periods, deletion/correction handling and privacy terms; implement the corresponding process before making promises. Publish Gabrielle's actual access form before enabling signatures. Payment decisions remain separate.
7. **Email delivery:** Configure Resend/custom SMTP, real magic-link expiry/replay/routing tests and guest-link delivery only to stored booking contacts. Private guest link creation currently does not send email. Keep guest checkout off until the complete booking/payment approach is approved.

## References

Review followed Supabase's [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), [function security guidance](https://supabase.com/docs/guides/database/functions), and Vercel's [response headers](https://vercel.com/docs/headers/response-headers) / [configuration documentation](https://vercel.com/docs/project-configuration/vercel-json).

## Validation

The existing full suite passed: 92 tests, 91 passed, one optional native PostgreSQL concurrency test skipped, zero failed. The two added security-configuration regression tests also passed. The clean production build succeeded. Hosted permission checks were read-only; no provider, authentication, database grant, payment or business policy was changed by this audit.
