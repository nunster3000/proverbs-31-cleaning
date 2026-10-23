# Stripe payment connection

## Implemented

- Server-priced, single-visit deposit and final-balance Checkout Sessions.
- Embedded Stripe Payment Element inside a Proverbs 31 cream/gold payment panel. Card details go directly to Stripe; the application never receives or stores them.
- Checkout uses `ui_mode: elements`, the current Stripe.js SDK, and `redirect: if_required`; ordinary card payments stay on the website. Bank or wallet authentication may require an external authorization step.
- Acknowledgment of the current business-published policy is required before the first payment. The booking retains its accepted policy snapshot.
- Starting-price deposits use the existing quote snapshot (50% of the base service price). Final payments require an accepted reviewed total, completed service, and an issued balance.
- Stripe-signed webhooks, not client-side confirmation, credit the payment ledger. Duplicate events cannot double-credit a booking. Changed/cancelled payment situations are held for owner review.
- Automatic customer emails remain independently disabled. Payment receipts queue without being sent.
- Production sandbox payments cannot become available to public customers when the countdown expires. Live credentials and the live webhook are required for real payments.

## Verified hosted sandbox rehearsal — October 23, 2026

A disposable technical-account booking was used; no real customer agreement was published or signed.

| Check | Result |
| --- | --- |
| Standard base / laundry starting estimate | $110 base / $130 estimate |
| Deposit | $55 paid; one Stripe ledger entry; moved to Awaiting walkthrough |
| Declined test card | Stripe rejected it; booking remained unpaid |
| Reviewed total for final-payment fixture | $145 |
| Final payment | $90 paid; total recorded payments $145 |
| Stripe webhook delivery | Both completed events delivered; zero pending deliveries |
| Signed duplicate event replay | HTTP 200; still exactly two payment records |
| Forged webhook | HTTP 400; no credit |
| Private checkout data | Anonymous/customer direct reads denied; customer settlement execution denied |
| Customer dashboard | Reflected completed deposit/final payment and no remaining balance |
| Live countdown | October 26, 2026, 9 AM Eastern; public checkout still HTTP 503 before opening |

The hosted-page rehearsal passed. Embedded payment sessions and the custom payment UI have unit/regression coverage; the real embedded-card rehearsal requires the account's matching sandbox publishable key. Do not substitute the publishable key used internally by Stripe's hosted page.

## Remaining activation

1. Enter the matching sandbox publishable key privately and complete the embedded-card rehearsal.
2. Verify Gabrielle's live Stripe account can accept charges and has the intended payout configuration.
3. Store the matching live secret/publishable keys only in the business Vercel project's environment settings. Never commit secret keys or send them in chat.
4. Register the live webhook at `https://www.proverbs31cleaningcoservices.info/api/stripe-webhook`, save its signing secret, set `STRIPE_MODE=live`, and deploy.
5. Gabrielle reviews/publishes her policy draft and other owner approvals in Admin → Launch preparation. The clarified cancellation draft refunds deposits with at least 72 hours' notice and retains deposits for shorter notice. Rescheduling remains subject to owner review.
6. Verify the live embedded form can initialize without charging a card. Do not make real-money test transactions.

Required environment values: `PAYMENTS_ENABLED`, `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. Countdown and email switches are separate and must not be changed as part of payment activation.

## Current deployment state

The embedded UI is prepared behind the payment activation switch. `PAYMENTS_ENABLED=false` until the matching account keys are entered and the embedded sandbox rehearsal passes. Both temporary rehearsal bookings, their customer row, payment entries, and queued emails were removed after the hosted test. The Stripe sandbox retains its own test transaction history; no real money moved.

The final local regression run passed 141 tests, with two environment-dependent tests skipped. The production build passed.
