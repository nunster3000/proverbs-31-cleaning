# Proverbs 31 Cleaning

Cinematic, responsive customer booking demonstration for Proverbs 31 Cleaning Co.

The static website lives in `cinematic-preview/`. It includes the homepage, Services, interactive home selection, sample calendar, guided account setup, payment previews, confirmation, and customer dashboard.

All accounts, availability, emails, and payments are simulated. The owner dashboard is a local-only prototype. Demo details carry between screens using browser session storage.

## Run locally

```sh
python3 -m http.server 8765 --directory cinematic-preview
```

Open http://localhost:8765/.

## Vercel

Project: `proverbs-31-cleaning` under Khris’ projects. Framework: Other. Root directory: `cinematic-preview`. No build or install command is required. Output directory: `.`.

Production: https://www.proverbs31cleaningcoservices.info

The apex `https://proverbs31cleaningcoservices.info` permanently redirects to `www`. The business project’s fallback address remains `https://proverbs-31-cleaning-seven.vercel.app`.

Business-owned Vercel team: `proverbs-31-cleaning-co` · Project: `proverbs-31-cleaning`. The original personal-team demo remains separate. Both local Vercel links now point to the business project; run CLI deployments from the repository root because the Vercel project root is `cinematic-preview/`.

Generated assets and their prompts are retained with the source. Screenshot proof files and local Vercel metadata are excluded.

## Automatic deployments

The public `nunster3000/proverbs-31-cleaning` GitHub repository is connected to the Vercel project. Pushes to `main` deploy production; other branches use Vercel previews. The configured repository root is `cinematic-preview/`.

The Supabase backend implementation is ready for project configuration. Until Supabase is connected, this deployment remains a fictional demo. Payment processing and business-email delivery are not connected.

## Service rules updated after owner clarification

The shared catalog in `cinematic-preview/assets/service-catalog.js` defines Standard Cleaning, Deep Cleaning, Apartment Cleaning (Move-In / Move-Out), and Airbnb Turnover. King/Queen bedroom-and-bathroom scopes are Airbnb guest-suite options, not standalone service categories. Whole-home prices remain size-based starting prices. Deep Cleaning adds $100; baseboards are included, and selecting Kitchen as a deep-cleaning focus includes refrigerator and stove/oven care without double charging.

Optional add-ons: laundry $20/load (folding and hanging), refrigerator $75, stove/oven $85, baseboards $45. The demo calculates the existing 50% deposit from the starting service amount before optional add-ons, credits it toward the estimated total, and leaves final pricing pending walkthrough review. This deposit calculation should be confirmed when connecting real payments.

Customer portal Virtual Walkthrough accepts sample photos/videos, room labels and notes. Local previews can be saved to this device's IndexedDB, restored, removed, or cleared. Nothing is uploaded. Limits are prototype choices (6 files, 20 MB each, 80 MB total), not approved production policies. Restarting booking clears session details, not saved walkthrough media. The demo privacy page explains deletion.

Before production: connect and verify the Supabase authentication, database, private uploads, pricing, and scheduling implementation; approve retention/deletion rules and configure payment and email providers. The supplied logo is used outside the cinematic hero.

Pricing verification: `node --test tests/service-pricing.test.cjs`.

Booking Review and the customer portal share a service summary showing scope, included tasks, selected paid add-ons, starting service price, estimated total, and starting-price deposit. New demo bookings save their included-care snapshot with the existing session record. Portal overview, booking details, walkthrough, and payment breakdown keep final pricing pending virtual walkthrough review; no final balance is issued automatically.


## Owner dashboard demo

Open `cinematic-preview/admin.html` (or `/admin.html` on the hosted demo). Overview, bookings, calendar, walkthroughs, payments, and availability settings work against fictional records in local storage (`p31-owner-demo-v1`). Customer demo bookings are imported once per booking and connected to the owner workflow when the same browser tab navigates between the customer and owner pages. State changes sync between tabs on the same origin/device; no records are sent to a server.

Supported workflow: add a manual booking; enforce owner working days, arrival-block capacity and blocks; reschedule/cancel; review locally saved walkthrough media or record an externally received walkthrough; add itemized price adjustments/credits; prepare a reviewed quote; accept the quote in the customer demo portal or record outside approval; mark the visit completed; issue a demo final balance; and record/simulate final payment. Account customers see their reviewed quote and balance; guest email previews offer a local demo payment page. Email previews never send messages. Media received outside the portal can be added to the same local IndexedDB walkthrough store.

Issuing balances requires walkthrough review, customer quote approval, and completion. Starting estimates remain visible separately from reviewed totals. Adjustments invalidate earlier quote approval. Payments are manual records or simulations, not processor transactions. The owner calendar does not yet replace the sample calendar in the customer booking flow; a shared backend scheduling service remains required.

The local demo is public and unauthenticated, for fictional data only. Connected mode uses the separate authenticated workspace and Supabase backend. Follow BACKEND_SETUP.md before real use; business email, online payments, retention jobs, and optional calendar integration still require configuration. Reset owner demo in Settings restores sample owner records but does not delete saved walkthrough files or the customer session record. Clear walkthrough media through the customer portal or browser site data.

Verification: `node --test tests/*.test.cjs`. Manual browser checks cover blocked-time conflicts, manual bookings, owner media, quote review/acceptance, account and guest final-payment simulations, and small-screen layouts.


## Supabase backend (ready to configure)

Start with [BACKEND_SETUP.md](BACKEND_SETUP.md). No Supabase project or credentials are currently connected. The production demo stays in local/fictional mode until `BACKEND_ENABLED=true` and all required Supabase environment variables are set.

The implemented backend includes:

- PostgreSQL customer records and immutable visit contact/property snapshots.
- Authenticated owner/customer access with row-level security and owner grants stored outside browser control.
- Server-calculated prices, transactional capacity checks, blocked arrival windows, and atomic initial recurring reservations.
- Walkthrough review, revision-checked quote approval, an idempotent manual payment ledger, private owner notes, and audit history.
- Private signed uploads, file signature/size/type validation, scoped short-lived preview URLs, and a pending notification outbox.
- Connected booking mode on `care.html` and an authenticated `workspace.html` for owner/customer database workflows.

Do not copy browser demo records into the database. The supplied SQL migration seeds only the service catalog and initial schedule settings. Online payments and business emails remain explicitly disconnected; a booking never claims a deposit was paid.

```sh
cd cinematic-preview
npm ci
npm test
npm run build
npm run dev
```

Open `http://127.0.0.1:8766/`. Vercel runs the same static build and `api/app.js` server function. The public output is `dist/`, which excludes server sources, environment files, and migrations. SQL/RLS tests use a real embedded PostgreSQL engine with Supabase Auth/Storage schema fixtures; hosted Auth, Storage, SMTP, CAPTCHA, and deployment integration require verification after configuration.

### Proverbs 31 Cal

The owner calendar manages manual, website, and customer-portal bookings. Block an entire day, a seven-day range, a longer date range (up to one year), an arrival window, or custom hours. Existing visits must be moved or cancelled before overlapping time can be blocked. Partial-hour blocks close overlapping arrival windows. The live demo uses browser storage; the prepared Supabase mode applies the same rules on the backend when connected.

Use **Google Calendar** for import guidance, or download `.ics` for Google/Apple Calendar. Exports include visit contact names, addresses, and arrival windows, but no access instructions, walkthrough media, or payment details. Exports are snapshots, not sync; external changes never control website availability. The demo exports all noncancelled visits; the connected calendar exports its displayed month.

The customer demo has **Back to Admin** links in its header and sidebar, so the owner can return after previewing the customer portal. Connected sign-in uses one email verification page for customers and the owner. Owner navigation is based on the backend role; a URL parameter or the demo return link does not grant access. The business owner email will be assigned during Supabase setup, not hardcoded in the app.

In Proverbs 31 Cal, select a date and use **Open booking blocks**: choose a 2-hour or 3-hour length, adjust the day’s start/end, check the blocks to offer, and save. This overrides that date only, including the ability to open a normally closed weekday or close all blocks. Existing visits keep their original times; overlapping bookings and time blocks still close affected capacity. Customer booking uses the same windows. Supabase remains disconnected; the prepared backend stores date openings and enforces interval overlap when enabled.
