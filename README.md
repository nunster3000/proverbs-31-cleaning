# Proverbs 31 Cleaning Co.

Production website and customer/admin web app for Proverbs 31 Cleaning Co.

## Application

Static pages and browser code live in `cinematic-preview/`. The Vercel API uses Supabase for authenticated customer records, bookings, server-authoritative pricing, scheduling, and private walkthrough media. Customers and the owner share an email-link sign-in portal; roles are verified by the backend.

The business owns its Vercel project and custom domain. This repository also supports the separate portfolio deployment. Keep production credentials in environment variables; never commit them.

## Current launch status

Supabase is connected. Email sign-in, guest booking, and outbound email remain disabled pending provider setup and the business’s final launch review. Online payment processing is not connected; authorized admins record externally received payments. No simulated payment is presented as an actual charge.

See `BACKEND_SETUP.md` for environment variables and setup. See `docs/` for verification results, remaining physical-device checks, and launch decisions requiring business confirmation.

## Local development and verification

```sh
npm --prefix cinematic-preview ci
npm --prefix cinematic-preview run dev
npm --prefix cinematic-preview test
npm --prefix cinematic-preview run build
```

The build clears `dist/` and excludes retired prototype scripts and design prompt/manifest files. QA test data belongs only in isolated test databases. `tmp/` and `output/` are local verification artifacts and must not be deployed.

The optional PostgreSQL concurrency suite requires a fresh local `p31_qa_*` database; see `docs/access-calendar-verification.md`.

## Workflow rules

- Starting prices are versioned in each booking’s quote snapshot. Catalog changes affect new quotes only.
- Deposit is 50% of the starting service price; add-ons are itemized separately.
- Booked requires the deposit; Confirmed requires admin walkthrough approval.
- Later progress is admin controlled. Optional post-cleaning uploads can complete a visit, and evidence can also be added afterward.
- Cancellation and rescheduling require explicit admin review. No automatic fees or refunds.
- Customer and admin dashboards poll for updates while visible.
- The backend calendar owns availability. Google/Apple `.ics` exports are copies, not two-way integrations.
- HEIC/HEIF photos convert to JPG on-device before private upload.
