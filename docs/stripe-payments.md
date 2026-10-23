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

The hosted-page and real embedded-card rehearsals both passed. On a 390 × 844 phone viewport, a declined card left the booking unpaid, the $55 deposit updated the booking after webhook verification, and the $90 final payment cleared the reviewed $145 total. Both successful payments stayed on the website and displayed the backend-verified receipt. Duplicate webhook replay left exactly two payment records.

## Live connection — October 23, 2026

- Verified the business live account: Proverbs 31 Cleaning Co Services. Charges and payouts are enabled.
- Verified that the live publishable and secret keys initialize the same embedded Checkout Session on the business HTTPS domain. No card details were entered and no payment was submitted. The unpaid session was expired immediately afterward; Stripe retains its configuration-test history.
- Connected the live webhook at https://www.proverbs31cleaningcoservices.info/api/stripe-webhook for completed Checkout Sessions and successful asynchronous payments.
- Stored the matching live keys and webhook secret as server environment settings in the business Vercel project. Never commit secret keys or send them in chat.
- Production uses STRIPE_MODE=live and PAYMENTS_ENABLED=true. Public booking and payment APIs remain gated by the existing October 26, 2026, 9 AM Eastern countdown.
- Automatic customer emails and guest access remain disabled independently.
- Disposable sandbox booking/customer rows, payment records, audit records, and queued emails were removed after verification. Stripe keeps its sandbox test-transaction history; no real money moved.

## Owner approval still required

Gabrielle must review and publish her policies and other owner approvals in Admin → Launch preparation. The payment endpoint requires acknowledgment of the business-published policy before the first payment. No policy or agreement was published or signed for this technical test.

The clarified cancellation draft refunds deposits with at least 72 hours' notice and retains deposits for shorter notice. Rescheduling remains subject to owner review.

## Verification and operations

The local regression suite passed 141 tests, with two environment-dependent tests skipped. The production build passed. The sandbox secret, publishable, and webhook keys remain stored privately for future testing; future sandbox rehearsals should use an isolated preview environment after public launch.

Required environment values: PAYMENTS_ENABLED, STRIPE_MODE, STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET. Countdown and email switches are separate and must not be changed as part of payment activation.
