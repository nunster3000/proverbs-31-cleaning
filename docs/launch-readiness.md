# Launch readiness review — October 22, 2026

Current checkpoint: [October 22 launch status](launch-status-2026-10-22.md). The audit history below includes earlier disabled-provider and untested-hosted states; use the checkpoint for the current state. Production upload rehearsal and cleanup are now complete. Native concurrency and encrypted QA recovery passed. Production backup activation, approved-policy retention, actual approved-form signing and physical-device handover remain dependencies.

## Completed

- Removed the visible “About this demonstration” privacy heading.
- Corrected Contact to Gabrielle Jackson and added the confirmed email: gabriellejackson@proverbs31cleaningcoservices.info.
- Removed the phone number at the user’s request. Retained the approved Atlanta-area wording and added manual address/distance review. No city/ZIP boundary is enforced.
- Added Booking and service information, linked from public pages: starting estimates, 50% starting-service deposits, walkthrough/price review, change requests, first-four recurring reservations, and current contact-only booking/payment arrangements.
- Retained explicit no-automatic-fee/no-automatic-refund behavior; did not invent notice periods, nonrefundable deposits, guarantees, or fee amounts.
- Clarified the interim privacy notice and its current launch status. This is not the final account privacy policy.
- Removed stale public-source demonstration styling and guest-email/checkout wording. Replaced outdated repository instructions describing local simulated bookings.
- Production build excludes retired prototype scripts, design prompts/manifests, and proof images. Root deployment ignore excludes local QA servers, reports, tests, and docs from uploaded project sources.
- Public navigation checks cover local links and expected contact details. Launch, pricing, workflow, and privacy test suites remain enabled.

## Business confirmation still required before account registration opens

1. Phone is intentionally unpublished. Gabrielle may add a customer-facing phone later through Website content.
2. Atlanta and surrounding areas is approved. Gabrielle decides whether to approve each address based on distance. Any future travel charges require her explicit policy.
3. Approve cancellation/rescheduling notice requirements and how already paid deposits/final payments are handled. No automatic fees or refunds are implemented.
4. Set customer-record, walkthrough and completion-media retention periods, who handles deletion/correction requests, and which payment/audit records must remain. Implement the corresponding deletion/retention process before promising it publicly.
5. Approve the final privacy notice describing fields collected, purposes, owner access, Supabase/Vercel/email providers, session storage, and retention/deletion practices. The current notice keeps online sign-in disabled and explains that online terms will be updated before registration opens.
6. Confirm any business service exclusions, access requirements, late/no-access handling, damage/complaint contact process, and recurring visit/payment terms that she wants published. Do not infer these from common cleaning-industry practices.

## Technical launch gates retained

- Resend/custom SMTP is configured and preview delivery tested. Public email sign-in, signup, guest booking and automatic customer email remain disabled.
- Online payment processor is not connected. Only externally received payments are recorded; request submission collects no payment.
- Before enabling accounts: final approved privacy/booking information; delivery and magic-link expiry/routing tests; customer/admin ownership checks with hosted sessions; real hosted media transfer; physical iPhone/Android checks.
- The deployment remains noindex/nofollow. Remove that header only when the business approves public launch.
- Gabrielle is the website owner/admin. Complete her owner handover; Vercel permissions are separate.

## Privacy review reference

FTC business guidance emphasizes accurate privacy promises and a written data-retention policy that specifies what is retained, for how long, and how it is disposed of. This review does not certify legal compliance or substitute for business approval.

https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business
https://www.ftc.gov/business-guidance/privacy-security/consumer-privacy

## Editable business pages

About Us now has a company introduction, owner introduction and public photo layout. Owner-only Website content controls update About Us and Contact without code. The phone defaults to blank; owner biography and photo are optional until Gabrielle supplies them. Content changes use revision checks and an audit log. Owner business photos use a separate public site-media bucket; customer walkthroughs remain private. New controls remain behind disabled sign-in until provider setup.

Browser verification: published and cleared a fictional phone in the isolated editor; Contact displayed a `tel:` link while populated and no link after clearing. Also saved an isolated owner biography/photo, verified public rendering, then restored blank biography/photo fields. No fictional content or phone was saved to production.

## Owner decisions in Admin → Launch preparation

Migration 020 adds owner-only controls (also in mobile More). Gabrielle reviews current website content and catalog prices, saves private policy drafts, previews and explicitly publishes approved wording, and records operating preferences. Content/pricing approvals become stale after their source changes. No business terms have been pre-approved for her.

Publish policies first, then review and publish the questionnaire and automatic representative signature authorization under Forms & agreements. New form versions freeze their attached policies. Assigned and signed forms retain original wording after later publication. These approvals never enable authentication, emails, guest access, payments, fees or refunds. Public pages read only published policies; owner notes and drafts stay private.

## Remaining work before payments can be the only launch dependency

1. Gabrielle completes Launch preparation and Forms & agreements. Phone, photo and biography remain optional.
2. Configure business-owned CAPTCHA protection and verify accepted/rejected requests. No site key is configured yet.
3. Choose a real backup arrangement covering database, private media and signed records; rehearse recovery in isolation. An admin preference does not create backups. Database backups alone do not restore storage objects.
4. Implement the retention/deletion process matching approved wording. Preserve necessary agreement/payment/audit records. Policy copy alone does not automate deletion.
5. Run a controlled hosted customer/admin/guest rehearsal: private file transfer, final-domain email links, expiry/replay and role isolation. Temporary authentication testing needs authorization; public access remains disabled.
6. Complete actual iPhone/Android checks and Gabrielle's handover. Browser previews and automated tests are not physical-device checks.
7. Connect payments last: authoritative deposit/final-payment webhooks, retry/duplicate safety, abandoned checkout, adjusted final balances, approved refund rules and reconciliation. Browser redirects must never mark money paid.
8. Enable access and automatic delivery after final review, monitor queue/errors, then remove noindex for approved public launch.

## Owner handover rehearsal

Practice manual booking, calendar opening/blocking, walkthrough review, proposed price and acceptance, signed records, On the way / Cleaning / Completed, externally received payments, change requests and agreement download. Changes remain admin-reviewed without automatic fees. Verify Atlanta Eastern time across device zones. Confirm recovery access to business provider accounts without storing secrets in the dashboard.

## Verification — October 22

Full suite: 118 passed, one optional native PostgreSQL test skipped, no failures. Additional owner-only API coverage added separately. Isolated database/browser checks covered explicit approval, private draft/publication, stale versions and frozen agreement policy snapshots. PDF appendix and Allura signature visually inspected. Fictional approvals and policy text stayed in localhost QA only. Migration 020 applied without publishing any business policy or changing authentication/delivery flags.

## Scheduled website opening — October 26, 9 AM Eastern

The business project uses `LAUNCH_COUNTDOWN_ENABLED=true`. A server-owned deadline in `server/launch-clock.cjs` is `2026-10-26T09:00:00-04:00` (13:00 UTC). Routing middleware serves the countdown for all document paths, including direct booking, account and admin links; the API rejects application requests before opening. Only the read-only clock/config endpoints remain available, and config withholds Supabase identifiers before opening. No query parameter, local storage setting or device date bypasses the countdown. Assets remain publicly downloadable; this is a launch gate, not protection for sensitive records (RLS/auth continue protecting those).

At the deadline, middleware passes through automatically with no redeploy and open countdown tabs verify server release before navigating home. `LAUNCH_LOGIN_ENABLED=true` opts into account API opening at the same deadline; Supabase email provider and signups require their own provider setup. `LAUNCH_HOLD=true` can keep account APIs closed after opening. Automatic emails, guest checkout/portal and payment-provider configuration retain their separate flags. Countdown expiry does not claim money was received or bypass agreement requirements.

CAPTCHA setup was deferred by the user on October 22. Existing provider rate limits remain; do not report bot protection as configured. Remaining owner approvals, backup recovery and hosted/device rehearsal remain launch work.

Scheduled-opening verification: 123 tests passed, one optional PostgreSQL test skipped. Production countdown deployment fd2023a verified on the homepage and direct Services, Care, Admin, Account and Sign-in URLs, including a query-string bypass attempt; every document returned the countdown with no-store headers. Booking APIs returned 503 before opening. Isolated clock tests verified the exact deadline, server-confirmed browser transition and scheduled auth/hold behavior. Desktop and 390px mobile layouts visually checked. After explicit user confirmation, Supabase email provider and new-user registration were enabled (confirmed in a fresh dashboard load), with email confirmation ON and anonymous sign-ins OFF. LAUNCH_LOGIN_ENABLED=true was saved in the business Vercel project and redeployed as proverbs-31-cleaning-ligzf3hg2-proverbs-31-cleaning-co.vercel.app (READY). Website auth remains false and booking APIs return 503 before the server deadline. Resolved at 17:32 UTC on October 22: a controlled project restart reconciled stale running Auth configuration. The project returned Healthy and /auth/v1/settings confirmed email=true, disable_signup=false and email verification required. The server-owned launch countdown remained active throughout. See auth-configuration-incident.md for evidence and recovery timing. No emails were sent, no customer accounts created, and automatic notifications/guest access/payment settings were not enabled.

## Temporary owner entrance

With OWNER_PRELAUNCH_ENABLED=true, the countdown includes Owner sign-in. Only owner-sign-in.html and owner-preview.html bypass the document countdown; other page paths remain blocked. The login requests an email link for an existing account (no signup from this entrance). Before launch, every dashboard API request with the owner-preview header verifies the Auth user, email confirmation and database is_owner() result before reading or writing data. A header alone, a customer session, an unverified/anonymous session or an invalid token cannot access it. No owner role is granted by email or URL. LAUNCH_HOLD=true also blocks this entrance.

At the scheduled opening, temporary document paths redirect to normal sign-in/workspace and the temporary owner-config endpoint stops serving configuration. Callback query parameters are preserved for legitimate links that cross the opening time. Public launch timing, guest-access flags and automatic email settings are unchanged. Existing admin privileges remain controlled by Supabase.

Owner-access checks: full automated suite 127 passed, one optional PostgreSQL test skipped; includes real middleware execution across the deadline and server-side rejection of customer/forged/expired/unverified requests. No privileged service key is present in the loopback customer email test server; it permits only dashboard reads by the two authorized test emails.

### October 22 private authentication verification
- Existing work customer completed a real email-link sign-in into the customer workspace.
- New Outlook customer completed confirmation and entered the customer workspace, without a password or verification code. Outlook placed the delivered message in Junk; inbox placement remains a launch observation.
- Corrected both authentication email templates to honor Supabase's approved RedirectTo callback, with the canonical sign-in fallback. Runtime picked up the saved settings after project restart.
- Signed out both test sessions and removed the temporary localhost:8797 callback. Production callbacks are the canonical sign-in and temporary owner sign-in pages.
- Public config still reports authentication, automatic notifications, and guest access disabled before the October 26, 2026, 9 AM Eastern opening. Owner prelaunch access requires a verified database owner; no test customer was granted admin privileges.

### Temporary owner login verification
- Temporarily granted the verified work account owner access with explicit approval, then used a fresh live owner-email sign-in link. The real owner workspace loaded with admin navigation and booking data access.
- Removed that work account from private.owner_accounts immediately after verification. The owner query returned only gabriellejackson@proverbs31cleaningcoservices.info.
- The existing test workspace automatically returned to Owner Access after revocation and displayed access unavailable. No business records or prices were changed in this test.

### Timed launch boundary verification
- Added tests exercising the actual middleware and public API configuration at one second and one millisecond before launch, exactly at launch, one millisecond afterward, and the next day.
- Verified website, service, booking, login, and dashboard routes release together at October 26, 2026, 9:00 AM America/New_York (13:00 UTC), without redeployment. Public email-link requests permit new-user registration after release.
- Existing countdown browser tests verify automatic navigation only after server confirmation, independent of the device wall clock. Temporary owner routes switch to normal login/workspace at launch.
- 16 focused launch, owner-access, and login tests passed. Read-only production launch-status still reports the original deadline and pending=true. No live countdown, authentication settings, or production environment values changed in this verification.
