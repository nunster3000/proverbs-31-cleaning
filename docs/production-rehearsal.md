# Production rehearsal — October 22, 2026

## Completed against the hosted database

`ops/production-rehearsal.sql` ran successfully in Supabase SQL Editor. It uses the two existing verified test accounts and Gabrielle's existing owner identity under the actual authenticated/service roles. It does not grant roles. Every fictional row, calendar override, guest grant, audit event and notification is enclosed in one transaction ending in ROLLBACK.

Eleven assertions passed: customer self-access; foreign read/action denial; occupied-block rejection; separate-block availability; owner visibility; request notification queuing; server-only guest exchange; single-use exchange and scoped guest view; replay rejection; expired-session rejection; revoked-session rejection.

This validates actual hosted database functions and RLS under role/JWT claims. It is not a replacement for browser authentication, real object transfer, or simultaneous independent database-session tests.

The full regression baseline passed 129 tests with one optional native PostgreSQL concurrency test skipped. Nine focused workflow/HTTP/signature/rehearsal tests also passed. The new rollback script test verifies all fixtures and audit changes disappear in isolation.

## Hosted upload rehearsal — passed and cleaned up

Explicit approval covered a temporary work-account owner role, localhost:8799 callback, an existing server credential in a local private file, labeled fixture bookings/media and their permanent cleanup. Both existing test accounts completed real email-link login. An existing legacy service-role key was staged securely after rejecting masked key text; no credential was created. Two labeled test bookings and three media objects were created and removed. The calendar was restored. Both test sessions were signed out, the localhost callback was removed, the local server was stopped and its credential/ledger files were removed. Gabrielle is the only owner again.

`ops/private-hosted-rehearsal.cjs` binds only 127.0.0.1:8799 and verifies both approved test emails with Supabase. The server key and captured session tokens are never sent to the browser or logged. Browser mutations are denied; the rehearsal executes a fixed sequence. Public launch settings are not changed. Automatic notifications and guest checkout remain disabled. Temporary guest portal use exists only in the loopback server configuration.

Passed checks: real customer JPG/MP4 transfer; pending-finalization denial and idempotent retry; 20 MiB rejection; owner signed preview and anonymous denial; walkthrough review/current-price approval; real guest cookie exchange, replay denial, photo upload, approval and revocation. The actual owner dashboard displayed the hosted JPG and played the uploaded MP4 through its full five-second duration. The customer dashboard automatically showed the walkthrough-reviewed notice, accepted price and an outstanding deposit. No payments were recorded. Business agreements remain unpublished and unsigned. Actual agreement signing/download remains gated by Gabrielle's approval, with isolated regression coverage already available.

Cleanup used `ops/rehearsal-cleanup.cjs` and reviewed exact-ID SQL. The first cleanup transaction correctly rolled back on a guest-file dependency; the order was corrected and a guest-child regression added before successful rerun. Final hosted verification: zero bookings, upload records, customer profiles, queued notifications, agreements, signatures or rehearsal storage objects; original calendar restored. Isolated cleanup tests prove unrelated bookings, customers and notifications survive. The production callback allowlist contains only the canonical sign-in and temporary owner sign-in URLs.

## Additional verification and corrections

All 11 native PostgreSQL concurrency assertions passed on a disposable loopback cluster. The isolated encrypted database/media restore and tamper-rejection test passed; see backup-and-recovery.md for production prerequisites. Neither test used the hosted database.

Corrected the notification worker to use the same effective launch clock as the API, retaining independent NOTIFICATIONS_ENABLED and LAUNCH_HOLD gates. Thirteen focused notification/launch/full-flow checks passed. This does not enable customer delivery.

DNS audit found no root SPF or DMARC record. Added Zoho's published root SPF (`v=spf1 include:zohomail.com ~all`) and an initial DMARC policy (`v=DMARC1; p=none;`) in the business Vercel scope. Authoritative DNS confirmed DMARC; root SPF was also visible through the recursive resolver. Existing Zoho MX and Resend DKIM/send records were preserved. DMARC has no reporting recipient or enforcement policy yet. Inbox placement still needs follow-up; do not promise this removes Outlook Junk placement.

References: [Zoho SPF](https://www.zoho.com/mail/help/adminconsole/spf-configuration.html), [Resend DMARC](https://resend.com/docs/dashboard/domains/dmarc).

## Next technical work

After the hosted rehearsal: choose/implement a backup and media-recovery arrangement, verify restoration, implement retention handling that matches approved business policy, complete physical-device and owner handover checks, and perform the final launch switch review. CAPTCHA remains deferred by the user. None of these notes approve policies or enable production notifications/guest access.
