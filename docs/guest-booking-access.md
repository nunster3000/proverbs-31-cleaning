# Private guest booking access

Guest access manages one booking without creating an account or exposing the customer/admin dashboards. It supports walkthrough photo/video uploads (including on-device HEIC conversion), current-price approval, typed home-access authorization and signed-copy download. Guests contact Gabrielle for scheduling changes or payment arrangements; there are no online card charges or guest profile tools.

## Security and lifecycle

- Owner creates a link only for an active guest booking's stored contact email. Account-enabled customers use their account. Issuing a replacement revokes older links and sessions for the booking.
- Server generates 32 random bytes. The private grant stores a SHA-256 digest; raw link secrets are not placed in database rows, logs or notification-outbox records.
- The link secret arrives in the URL fragment, is immediately removed from browser history, and is exchanged only after an explicit Continue action. Links are one-use and expire after 30 minutes.
- Exchange creates a separate eight-hour HttpOnly, Secure, SameSite=Strict cookie scoped to `/api/app`. Production never stores guest secrets in localStorage or exposes the service-role key to the browser. The insecure-cookie exception exists only for a localhost fixture with NODE_ENV=test.
- Each guest request validates the grant, current contact email, account-disabled state, expiry and revocation. Reads and actions derive their booking from the grant, never a supplied booking ID. Private server-only RPCs provide a limited guest surface; existing account RLS/ownership functions are unchanged.
- Write requests require the canonical Origin and JSON. Price approval requires explicit consent and the current quote revision. Signing requires both acknowledgements, the current confirmed visit snapshot and assigned form version. Guest signatures and uploads record a guest-access reference rather than impersonating an authenticated account.
- Storage paths are server generated. Guests get signed upload URLs for scoped reservations and 60-second read URLs for verified files only. Server byte signatures and storage metadata are checked before upload completion; the database enforces file count/size/type and status restrictions. Revocation prevents further requests/finalization; an already-issued signed storage URL remains valid until its short/provider expiry.
- Closing guest access revokes the server grant and clears the browser cookie. Expired, cancelled, revoked or invalid links reveal no booking data. Recovery is a replacement link from Gabrielle; there is no public email/booking lookup endpoint.

## Launch controls

Migrations 013 and 014 are applied to the business-owned Supabase project (October 20, 2026). Production verification confirmed zero guest links, private table RLS, no authenticated/anonymous grant-table access, no public guest-dispatch execution, service-only execution and existing booking/media/signature RLS preserved.

Keep AUTH_ENABLED, GUEST_PORTAL_ENABLED and GUEST_CHECKOUT_ENABLED disabled. The portal defaults closed if its flag is absent. Resend is not wired to issue/deliver these guest links yet. For launch, implement provider delivery of fresh links to the stored booking email, test actual mailbox delivery/expiry, add Gabrielle's approved permission form, and only then enable the guest flags. Manual owner link-copy controls are prepared; no live private links have been generated or sent. Completed bookings can receive replacement links to view receipts and balances; uploads, price approval and signing remain closed after completion. Cancelled bookings require direct assistance.

## Verification

SQL and HTTP tests cover single use, expiry, replacement/revocation, canonical Origin, cookie attributes, hashing, service-role-only access, direct-table denial, cross-file ID rejection, stale quote/form rejection, guest actor provenance, upload reservation/metadata, file byte verification and travel gating after signature.

At 320px and 390px, isolated browser testing covered one-use exchange, real JPG upload, a forced transfer failure/retry with retained room notes, admin media preview/review/confirmation, guest price approval and test-form signing, admin visibility, replacement-link recovery, server-side session close, stale-price re-review with cleared consent, and signed-copy download. No live customer, form, signature, payment, link or email was created. Physical mobile device and real mailbox tests remain launch checks.
