# Technical closeout — October 23, 2026

Launch remains October 26, 2026, 09:00 America/New_York (13:00 UTC). No countdown bypass was added.

## Customer email and access

Supabase runtime reports email enabled and registration enabled. Passwordless account access is armed through the shared launch clock. Customer notification delivery and private guest access are armed in business Vercel, but the dispatcher and public API stay closed until launch. Provider/queue tests cover event snapshots, idempotency, retries, lease fencing, guest links and cancellation behavior. Provider acceptance is not proof of inbox delivery.

Guest **checkout** remains disabled: it still needs the separately deferred anonymous-auth/CAPTCHA setup. Owner-issued private guest access for manually arranged bookings is separate. Do not advertise public guest checkout until that path is completed and tested.

## Backups and monitoring

Second hosted GitHub run 39840850552 succeeded. Retrieved and decrypted production snapshot 4f8a47c3 from Backblaze, checked archive catalog (customer/booking/agreement/auth/storage/owner records) and read all repository data with restic check. That snapshot had zero media objects; separate fixture tests cover encrypted media recovery/checksums. A fresh production backup includes the operations/privacy migration.

Private backup runner reports success/failure through service-only Supabase functions. Independent Vercel cron checks every six hours for missing/stale (>36h) backup success, latest failed attempt, and terminal/expired email jobs. Technical alerts go only to Khris's work email, contain no customer information, and are suppressed for 24h after provider acceptance. This operates before launch. A platform outage can prevent this monitor running; it is not an independent external uptime service.

Recovery password custody still needs technical-owner confirmation. No paid plan or destructive pruning enabled. Backblaze caps/free allowances still apply.

## Search visibility

Canonical-domain public pages become eligible for indexing at launch. Before launch robots disallows crawling and sitemap has no URLs. Account/admin/guest/payment/booking pages and APIs stay noindex; previews and noncanonical domains stay noindex. Public pages have canonical URLs and descriptions. This is technical discoverability, not marketing or a guarantee of Google rankings. Robots directives are not access control.

## Privacy operations

Owner-only request tracking, identity-verification gating, exact-customer inventory and private exports are available in Admin → Privacy & operations. See privacy-operations.md for limits. Retention/purge choices remain owner approvals; no automatic deletion, refund or legal promise was introduced.
