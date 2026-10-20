# Full mobile booking verification — October 20, 2026

## Scope and results

Exercised the actual planner and both dashboards at 319px and 390px widths using isolated local identities, database migrations, and media storage stand-ins. Production prices, accounts, and bookings were untouched. All 69 standard tests passed; the optional native concurrency suite was skipped in this run. The production build passed.

## Walkthrough

- Selected rooms on the large-home plan, then switched property sizes. Checked King and Queen Airbnb suite controls and Apartment Move-Out selection.
- Booked Deep Cleaning for one bedroom, kitchen focus, and two laundry loads: $250 starting estimate, $105 starting-price deposit, $145 balance.
- Checked one-time, weekly and custom recurrence controls. Selected an available calendar date/block and completed the customer details form.
- Submitted the request, verified confirmation, and opened customer and admin dashboards. The new admin booking badge appeared and the customer initially saw Awaiting deposit.
- Recorded the isolated external deposit through the admin UI. Progress became Booked.
- Selected a real HEIC through the mobile file picker, verified on-device JPG conversion and upload, then saved admin walkthrough review and confirmed the visit.
- Prepared the quote; the customer received an approval badge, acknowledged the details, and accepted $250. The admin saw the approval update.
- Advanced the visit manually through On the way, Cleaning in progress and Completed. Customer progress updated automatically.
- Issued the $145 final balance and recorded its external receipt through the admin UI. Customer final-payment badge cleared; balance became zero.
- Uploaded a real 5.7 MB MP4 as optional completion evidence after completion/final payment. Visit stayed completed and payment records remained intact.
- Checked the admin calendar and More menu at phone width. Customer form and admin calendar had no horizontal overflow.

## Fixes made during testing

1. Enlarged labeled room choices and calendar navigation to 44px minimum touch targets, increased calendar date/block height, and improved wrapping/safe-area spacing for phone controls.
2. Fixed a generic pricing-disclaimer update that overwrote the selected visit date/time on the final request screen. Rechecked the screen with an Apartment Move-Out request: Thu, Oct 29, 2026, 9:00 AM–12:00 PM remained visible before submission. This second request was left unsubmitted.

## Local evidence

- `output/mobile-booking-flow-result.json`: verified database outcome.
- `tmp/mobile-final-review.png`: corrected final request review.
- `tmp/mobile-admin-more.png`: admin More menu.

These files are not deployed. The test pages use explicit local identity/storage stand-ins; email authentication, real payment charging, and hosted Supabase upload transport were not exercised. Actual iPhone/Android camera pickers, keyboard behavior and device-specific safe areas remain the final physical-device checks after sign-in is enabled.
