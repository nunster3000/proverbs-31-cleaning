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

The notification credential is independent of Supabase SMTP. Its replacement remains restricted to Sending access for the business domain and is stored write-only in Vercel; it is never embedded in client code. Setup diagnostics return only HTTP status codes, not provider bodies or credentials.

The authorized setup email was accepted by Resend through the production website on October 21, 2026 (provider ID `01a16175-d199-7300-9a38-ed721c0ed2b1`). The dedicated setup-test switch was returned to false afterward. Normal customer dispatch and public authentication remain disabled. Final inbox delivery is checked separately in Resend.

Resend reported the setup message Delivered. Final production checks confirmed: setup-test endpoint 403, scheduled dispatcher disabled, public sign-in false, notifications false, guest access false, Supabase email provider false, and signup disabled. The temporary local test secret file was removed. The unused original notification key was permanently revoked with approval; only the working, domain-restricted replacement and the separate Supabase Auth key remain. The separate Supabase Auth key was not changed.

### Branded email design · October 22, 2026

The Magic Link and Confirm Signup templates were saved in the business Supabase project with the shared cream, gold, and espresso layout and existing company logo. Both retain the canonical token-hash callback, one-use/one-hour wording, and passwordless link flow. Subjects: “Your secure sign-in link · Proverbs 31” and “Welcome · Confirm your Proverbs 31 account”. Regenerate their versioned HTML with `node cinematic-preview/server/auth-email-templates.cjs` after editing the shared layout.

The five queued customer notifications use the same table-based layout, inline styles, logo alt text, phone breakpoint, booking summary, and full-width action button. Plain-text messages remain available. Guest links retain their one-use/30-minute wording and restricted destination. No client data is included in logo image URLs.

Browser previews were checked for sign-in and quote emails at phone and desktop widths; automated checks cover callback preservation, HTML escaping, recipient routing, amounts, and disabled delivery gates. Actual Gmail/Outlook/Apple Mail inbox rendering remains a controlled delivery check before launch. No emails were sent for this design review. Public sign-in, signup, guest access, and notifications remain disabled.

The first branded design preview was sent once through Resend’s draft-template test sender to khris.nun@proverbs31cleaningcoservices.info and received in Zoho on October 22. The subject was “[TEST] Design preview · Proverbs 31 Cleaning Company”; all booking details were fictional. Zoho initially blocked external images; displaying images for that message revealed the logo. No automatic image-download preference was enabled. The preview remains an unpublished Resend draft.

The shared logo asset is now the email-specific 352px JPEG (~50 KB) instead of the original 1254px PNG (~1.1 MB), including Magic Link and Confirm Signup templates. This reduces transfer size by about 96% while preserving the original website asset. Recipient-controlled image blocking still applies. A regression check caps the email asset below 60 KB.

### Production event routing · October 22, 2026

Migration 019 was applied and verified in the business database. It adds immutable per-event context to outbox rows and updates the existing owner booking-action function without changing role grants, authentication flags, or delivery flags. No live customer records or notifications were created for verification; the production pending queue was zero.

| Trigger | Email design / outbox kind |
| --- | --- |
| Booking request created | Request received (`booking_requested`); does not claim payment or approval |
| Gabrielle approves deposit-paid, reviewed walkthrough | Booking confirmation (`booking_confirmed`) |
| Owner prepares reviewed quote | Quote ready (`quote_ready`) |
| Owner updates visit progress | Neutral booking update (`booking_updated`) |
| Manual completion or first completed evidence upload | Cleaning complete (`service_completed`); later uploads/retries do not duplicate it |
| Owner issues final balance after completion and quote approval | Final balance (`final_balance_ready`); snapshot records invoice issued, repeated issuance does not duplicate it |
| Approved reschedule request or actual owner date/block change | Rescheduling (`booking_rescheduled`), including previous and updated visit; new access agreement required |
| Approved cancellation request or owner cancellation | Cancellation (`booking_cancelled`); contact action, no fresh guest grant or refund/fee promise |
| Gabrielle declines a cancellation/reschedule request | Request reviewed (`change_request_declined`); existing booking stays unchanged |
| Email sign-in / account confirmation | Supabase Magic Link / Confirm Signup branded templates; email provider and public sign-in remain disabled |

Guest notices use the same event designs, with an expiring one-booking private link only when guest delivery is enabled. Cancelled guests receive the contact action. Email recipient, booking snapshot, selected template and old visit context are recorded server-side; dispatch cannot run while public sign-in or notification delivery is disabled. Resend design-preview drafts are not used as automatic templates—the shared versioned renderer is the source of truth.

Targeted tests cover request creation, confirmed-only messaging, quote preparation, approved/declined changes, direct rescheduling, duplicate decisions, manual/upload completion, late evidence, invoice issuance, guest-link routing, immutable queue snapshots, and disabled dispatch. This verifies queue-to-render behavior without enabling or sending automatic emails.

### Full account/guest booking rehearsal · October 22, 2026

`tests/booking-email-full-flow.test.cjs` runs four fictional bookings (account and anonymous-guest full visits, plus account and guest cancellations) against all migrations through 019 in an isolated PGlite database. It verifies 30 queue checkpoints and 20 mocked delivery-worker messages; no live provider request is made. The test covers idempotent submission/deposit recording, walkthrough reservation/verified-storage metadata, review versus confirmation, adjusted quote and price acceptance, signed agreements, approved rescheduling with old/new visit context and required re-signing, ordered progress, completion, invoice issuance, final payment recording, and approved cancellations without automatic payment changes. Guest scheduling/cancellation requests are handled by Gabrielle through admin actions after customer contact, matching the current guest experience.

Every queued row is checked for the correct booking, recipient, account/guest mode, and expected cumulative event types. A generated one-booking guest grant is redeemed once; replay is rejected. The dispatcher is first exercised with authentication/delivery disabled and must neither claim nor send. The enabled dispatcher is tested only through injected synthetic configuration and a mocked provider against the same isolated database; template rendering, guest-link routing, lease handling and acknowledged completion are checked. Signed originals remain archived after rescheduling. No real storage transfer or payment processor is involved in this rehearsal. Production configuration was read afterward and still reported sign-in, notifications, guest access and guest checkout disabled.
