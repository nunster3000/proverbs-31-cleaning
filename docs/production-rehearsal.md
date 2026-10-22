# Production rehearsal — October 22, 2026

## Completed against the hosted database

`ops/production-rehearsal.sql` ran successfully in Supabase SQL Editor. It uses the two existing verified test accounts and Gabrielle's existing owner identity under the actual authenticated/service roles. It does not grant roles. Every fictional row, calendar override, guest grant, audit event and notification is enclosed in one transaction ending in ROLLBACK.

Eleven assertions passed: customer self-access; foreign read/action denial; occupied-block rejection; separate-block availability; owner visibility; request notification queuing; server-only guest exchange; single-use exchange and scoped guest view; replay rejection; expired-session rejection; revoked-session rejection.

This validates actual hosted database functions and RLS under role/JWT claims. It is not a replacement for browser authentication, real object transfer, or simultaneous independent database-session tests.

The full regression baseline passed 129 tests with one optional native PostgreSQL concurrency test skipped. Nine focused workflow/HTTP/signature/rehearsal tests also passed. The new rollback script test verifies all fixtures and audit changes disappear in isolation.

## Hosted upload rehearsal — prepared, awaiting browser availability

Explicit approval covers a temporary work-account owner role, localhost:8799 callback, an existing server credential in a local private file, labeled fixture bookings/media and their permanent cleanup. The work-account role was granted; the callback dialog is not yet verified saved. No persistent fixture booking or media has been created.

`ops/private-hosted-rehearsal.cjs` binds only 127.0.0.1:8799 and verifies both approved test emails with Supabase. The server key and captured session tokens are never sent to the browser or logged. Browser mutations are denied; the rehearsal executes a fixed sequence. Public launch settings are not changed. Automatic notifications and guest checkout remain disabled. Temporary guest portal use exists only in the loopback server configuration.

Planned checks: real customer JPG/MP4 transfer; pending-finalization denial and retry; 20 MiB rejection; owner signed preview and anonymous denial; walkthrough review/current-price approval; real guest cookie exchange, replay denial, photo upload, approval and revocation. Business agreements remain unpublished and unsigned. Actual agreement signing/download remains gated by Gabrielle's approval, with isolated regression coverage already available.

After review, run `ops/rehearsal-cleanup.cjs` to remove only tracked booking objects and prepare exact-ID database cleanup SQL. Execute the reviewed SQL in Supabase; remove the localhost callback and temporary role; sign out test sessions; stop the loopback server and remove local credential/ledger files. Verify no fixture notification remains before enabling delivery. Do not report the hosted upload rehearsal complete before these checks and cleanup finish.

## Next technical work

After the hosted rehearsal: choose/implement a backup and media-recovery arrangement, verify restoration, implement retention handling that matches approved business policy, complete physical-device and owner handover checks, and perform the final launch switch review. CAPTCHA remains deferred by the user. None of these notes approve policies or enable production notifications/guest access.
