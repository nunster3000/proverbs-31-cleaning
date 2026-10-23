# Technical closeout — October 23, 2026

Launch remains October 26, 2026, 09:00 America/New_York (13:00 UTC). No countdown bypass was added.

## Customer email and access

Supabase runtime reports email enabled and registration enabled. Passwordless account access is armed through the shared launch clock. Customer notification delivery and private guest access are armed in business Vercel, but the dispatcher and public API stay closed until launch. Provider/queue tests cover event snapshots, idempotency, retries, lease fencing, guest links and cancellation behavior. Provider acceptance is not proof of inbox delivery.

Guest **checkout** remains disabled: it still needs the separately deferred anonymous-auth/CAPTCHA setup. Owner-issued private guest access for manually arranged bookings is separate. Do not advertise public guest checkout until that path is completed and tested.

## Backups and monitoring

Second hosted GitHub run 39840850552 succeeded. Retrieved and decrypted production snapshot 4f8a47c3 from Backblaze, checked archive catalog (customer/booking/agreement/auth/storage/owner records) and read all repository data with restic check. That snapshot had zero media objects; separate fixture tests cover encrypted media recovery/checksums. A fresh production backup includes the operations/privacy migration. Restored its public/private/auth/storage schemas into a fresh Unix-socket-only PostgreSQL 17 cluster with zero restore errors; verified three Auth users, one owner, private walkthrough bucket and 18 public RLS tables. Restored owner/customer checks and restricted customer writes passed. The temporary cluster was removed. This is a real archive recovery test, not a recreation of hosted Supabase infrastructure or provider settings.

Private backup runner reports success/failure through service-only Supabase functions. Independent Vercel cron checks every six hours for missing/stale (>36h) backup success, latest failed attempt, and terminal/expired email jobs. Technical alerts go only to Khris's work email, contain no customer information, and are suppressed for 24h after provider acceptance. This operates before launch. A platform outage can prevent this monitor running; it is not an independent external uptime service.

Recovery password custody still needs technical-owner confirmation. No paid plan or destructive pruning enabled. Backblaze caps/free allowances still apply.

## Search visibility

Canonical-domain public pages become eligible for indexing at launch. Before launch robots disallows crawling and sitemap has no URLs. Account/admin/guest/payment/booking pages and APIs stay noindex; previews and noncanonical domains stay noindex. Public pages have canonical URLs and descriptions. This is technical discoverability, not marketing or a guarantee of Google rankings. Robots directives are not access control.

## Privacy operations

Owner-only request tracking, identity-verification gating, exact-customer inventory and private exports are available in Admin → Privacy & operations. See privacy-operations.md for limits. Retention/purge choices remain owner approvals; no automatic deletion, refund or legal promise was introduced.

Production verification: canonical home/account URLs still serve countdown, robots disallows all, sitemap contains no URLs, config returns auth/notifications/guest access false before launch, and operations check returns zero issues. Resend accepted setup email 01a169ad-d029-7941-ad15-b03344f85a46 to the technical work address; inbox delivery was not independently confirmed. Temporary setup-email flag is disabled afterward.

Validation: full application suite 146 passed, 2 environment-dependent tests skipped, 0 failures. Four Python backup tests passed, including encrypted media restore/checksum verification. Production archive restore completed with zero errors and restored access checks passed. Browser rehearsal at 390px verified privacy customer search/selection, accessible labels and no horizontal overflow. Build passed. Setup-email test endpoint was verified disabled (403); customer dispatcher before launch returned enabled=false/sent=0.

## Guest checkout follow-up (supersedes the earlier deferred status)

User approved CAPTCHA and guest authentication. Turnstile is connected to Supabase, protected anonymous sign-in is enabled, and both database/Vercel guest-checkout switches are armed for the unchanged launch time. Real browser CAPTCHA → anonymous signup → isolation → database prelaunch rejection passed. Missing/invalid CAPTCHA rejection was verified on both email and guest authentication endpoints. The temporary test identity and rehearsal UI were removed. See guest-checkout.md. Recovery-password custody remains explicitly pending, per the technical owner's reply.

Guest closeout verification: final deployment removes the temporary rehearsal; live public gates remain false before launch, and the database opening instant remains 2026-10-26T13:00:00Z. Guest checkout is fully armed behind that gate. Final tests: 151 passed, 2 environment-dependent skips, no failures. Real CAPTCHA-protected email-link request succeeded; compact mobile verification had no horizontal overflow. No real-money charge or business policy publication was performed.
