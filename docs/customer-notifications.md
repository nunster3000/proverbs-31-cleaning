# Production sign-in and transactional notifications

Public access remains closed until the owner explicitly authorizes launch.

## Email sign-in

The shared portal resolves roles from the authenticated backend. It supports normal SDK PKCE callbacks, invitation links with session fragments, and token-hash email callbacks. Credentials are removed from the address bar before verification. Supabase still verifies all sessions; URL parameters never grant an admin role. Expired links show a recovery message and allow a new link request. Public AUTH_ENABLED and the Supabase email provider remain off during implementation.

For consistent cross-browser email links, set Supabase's Magic Link and Confirm Signup templates to a link using:
`https://www.proverbs31cleaningcoservices.info/sign-in.html?token_hash={{ .TokenHash }}&type=email`
Do not change the Site URL, introduce wildcard callbacks, or turn on email/signup as part of editing templates. Invitation links remain supported independently. Test the actual production templates before launch.

## Delivery

Migration 015 snapshots each existing booking notification event. Existing queued notifications are held for owner review rather than sent on rollout. Only the service role can claim or finish a delivery. Claims use row locks, a two-minute lease, and a lease-specific completion token. Resend requests use the notification ID as a stable idempotency key. Retries back off and stop after five attempts or 23 hours; provider acceptance is distinct from inbox delivery. Resend's dashboard remains the delivery/bounce source.

Booking requests, booking updates (including walkthrough approval and scheduling decisions), quotes ready for approval, completion, and final balances use the existing transactional outbox. Messages use saved starting estimates and reviewed totals. They do not claim that a deposit was paid or offer online payments before a processor is connected. All visit windows use Eastern Time.

The worker runs at `/api/notifications` every five minutes. It requires an exact bearer CRON_SECRET. Both AUTH_ENABLED=true and NOTIFICATIONS_ENABLED=true are required before any email can be sent. Missing credentials fail closed. No key or raw provider error appears in API output or logs.

Production-only environment variables:
- RESEND_API_KEY: a new Sending-only key restricted to proverbs31cleaningcoservices.info, separate from Supabase SMTP.
- CRON_SECRET: a cryptographically random secret for scheduled dispatch.
- GUEST_LINK_SECRET: a separate random secret used to derive unique one-booking guest grants without storing plaintext tokens in the outbox.
- NOTIFICATIONS_ENABLED: keep false until launch approval and controlled delivery testing.

When the guest portal is enabled, guest notification emails can include a one-use, 30-minute private booking link. Only a hash enters private storage. The service-only grant RPC requires the current delivery lease and unchanged recipient. If guest access is disabled or no current grant can be issued, the email uses the Contact page instead. Completed guest visits retain read-only receipt access under the existing policies. Never forward guest links or put them in logs.

## Remaining launch verification

Apply migration 015 with approval, configure the scoped Resend key and cron/guest secrets, edit Supabase email templates, and conduct controlled deliveries to approved recipients. Keep public sign-in, signup, guest access and notifications off throughout. Verify inbox delivery, expired/used links, role routing, retry idempotency and real cron authentication. Form wording and payment processing remain separate launch gates.

## Connected configuration — October 21, 2026

Migration 015 was applied and production permissions verified: anonymous/customer queue claims denied, service-role claims allowed, and zero queued messages at connection time. Supabase Magic Link and Confirm Signup templates now match the versioned templates in `supabase/email-templates/`. The notification Resend key and cron/guest secrets are Production-only Vercel secrets. Public sign-in, signup, guest access, and normal notifications remain disabled.

An isolated POST `/api/notifications?setup_test=true` check is available only with the cron bearer secret and an explicit temporary `NOTIFICATION_SETUP_TEST_ENABLED=true` switch. It sends solely to the approved work email, never reads the customer queue, and uses a stable Resend idempotency key. Return this switch to false after the delivery check. No live booking or payment is created by this test.
