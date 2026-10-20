# Pricing verification — October 20, 2026

## Result

69 standard tests passed, including 1,280 independently calculated frontend/backend pricing combinations. The updated database suite also passed all 19 tests after adding the final odd-cent frontend/backend comparison. The optional native concurrency suite was not part of this pricing run.

The catalog-price update tests use disposable local databases. No production catalog prices, payments, or bookings were changed.

## Starting prices and inclusions checked

- Standard and Apartment Cleaning: Studio $85; 1 bedroom $110; 2 bedrooms $140; 3 bedrooms $175; 4 bedrooms $225; Large/Entire Home $250.
- Apartment Move-In and Move-Out retain the same size-based starting price and store the chosen subcategory.
- Deep Cleaning adds $100 to the selected whole-home starting price. Baseboards are included. Kitchen focus also includes refrigerator and stove/oven cleaning, without double charging selected extras.
- Airbnb Turnover: King guest bedroom/bathroom $65; Queen guest bedroom/bathroom $50. Suites cannot be booked under other services, and whole-home sizes cannot be used for the guest-suite service.
- Standard paid add-ons: refrigerator $75; stove/oven $85; baseboards $45.
- Laundry: $20 per load; checked 0, 1, 2 and 20 loads across every valid service/size and inclusion combination. Negative, fractional, invalid and over-limit quantities are rejected by the backend.
- Deposit: 50% of the starting service price, rounded to cents. Optional add-ons do not inflate that starting-price deposit.

## Existing booking protection

Tests changed every property starting price, the deep-cleaning adjustment, and each add-on price. An existing booking's full saved record stayed identical, including its quote snapshot, reviewed total, approval state, revision, and recorded deposit. New bookings used the edited catalog amounts. Existing tests also confirm owner-only access, stale-edit rejection, and audit logging.

In the actual mobile admin UI, changed the isolated 1-bedroom starting price from $110 to $125.01. The existing $110 booking, $55 deposit and $55 recorded payment remained unchanged. A new booking used $125.01 and a $62.51 deposit. Saved local evidence: `output/pricing-dashboard-test.json` and `tmp/pricing-admin-test.png`.

## Fix made

The browser previously calculated deposits using a floating half of the dollar price, potentially creating a half-cent when an admin entered an odd-cent starting price. Frontend totals now round using integer cents, matching PostgreSQL. The remaining balance is calculated by subtracting the rounded deposit from the total. For example, a $125.01 base requires a $62.51 deposit and leaves $62.50 before add-ons.

## Repeat

```sh
npm --prefix cinematic-preview test
npm --prefix cinematic-preview run build
```

Payment-processor charging is not exercised here; online payments and email sign-in remain disabled.
