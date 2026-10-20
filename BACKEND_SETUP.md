# Connect the Supabase backend

The backend code is implemented and the dedicated Supabase project is connected to the business Vercel production environment. Public catalog/quote reads are enabled; `AUTH_ENABLED=false` keeps account access and booking submissions unavailable while the email sender is deferred. All deployments now use the production-only app; the previous demonstration screens are retired. The business deployment uses `SITE_MODE=launch`: public booking/account routes remain unavailable until the backend is configured, rather than accepting simulated bookings. No demo customers, local photos, or simulated payments are migrated into the real database.

## Current hosted setup — October 19, 2026

- Organization: `Proverb 31 Cleaning Services` (currently owned by the developer's Supabase account).
- Project: `Proverbs 31 Cleaning Services`, reference `mokhzraxcbrmzpvedhxz`, US West (Oregon).
- Applied `001_backend.sql` successfully through SQL Editor after explicit approval.
- Verified 15 public tables, all 15 with row-level security enabled, private `walkthroughs` bucket, and zero customer records.
- Email provider and new signups disabled on October 20 at the user’s request; anonymous sign-in remains disabled and email confirmation remains required.
- Saved canonical Site URL and exact `/sign-in.html` redirect for the business domain.
- No website admin has been assigned yet; the intended administrator must first verify their email.
- Custom SMTP is not configured. The current dashboard requires custom SMTP before email subjects/templates can be edited; the magic-link/code template is still pending.
- Business Vercel Production has the Supabase URL/public key and sensitive server-only secret key, `BACKEND_ENABLED=true`, `AUTH_ENABLED=false`, canonical `APP_ORIGIN`, and guest checkout disabled. Portfolio/preview environments have no production Supabase credentials. Authenticated workflow tests await the email sender and verified accounts.
- Do not run the initial migration again: this project now contains the schema. Apply future changes as new migrations.

## 1. Create a business-owned project

Create a **new, dedicated** Supabase project in the business's account (or your development account if that ownership is agreed). Choose an appropriate US region. Store the database password privately; do not put it in Git or chat. This migration is intended for a new project, not a shared database with unrelated applications.

No custom domain is required to develop or connect this backend. The current Vercel URL can be used for authentication redirects while the domain decision is pending.

## 2. Create the database and private bucket

In Supabase SQL Editor, run the entire file:

`cinematic-preview/supabase/migrations/001_backend.sql`

It runs in a transaction and creates the customer database, bookings, recurring-visit groups, service pricing, availability, blocked time, quote adjustments, payment ledger, private file metadata, owner notes, audit history, and notification queue. It also creates a **private** `walkthroughs` storage bucket and its access policies. Do not change the bucket to public.

There is no customer seed/import. Only the approved service catalog and initial business settings are inserted.

## 3. Configure email sign-in

In Supabase Authentication:

- Enable email authentication and require email confirmation.
- Set the Site URL to `https://www.proverbs31cleaningcoservices.info` for the current deployment.
- Allow `https://www.proverbs31cleaningcoservices.info/sign-in.html` as a redirect URL. Add your custom domain's equivalent when it is ready. For local testing only, allow `http://127.0.0.1:8766/sign-in.html`.
- In the email magic-link template, include both the standard `{{ .ConfirmationURL }}` link and the `{{ .Token }}` code so the booking dialog can verify a code without losing the booking form.
- Configure custom SMTP before real customer use. Supabase's built-in sender only delivers to project-team addresses and is for testing. Configure a verified sender for customer email links; business booking notifications require a separate delivery worker.

Sign-in uses verified email links/codes with PKCE. No customer password is stored by this app. A user-provided role or browser setting never grants owner access.

## 4. Configure Vercel environment variables

In this project's Vercel settings, add these **server environment variables** for the intended environment:

| Variable | Value |
|---|---|
| `SITE_MODE` | `launch` (production-only on all deployments) |
| `BACKEND_ENABLED` | `true` on the connected business production deployment |
| `AUTH_ENABLED` | Keep `false` until the sender and authenticated workflows are ready; this separately gates account access and booking submissions |
| `SUPABASE_URL` | The project's HTTPS API URL |
| `SUPABASE_ANON_KEY` | Its public anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Its server-only service-role/secret key |
| `APP_ORIGIN` | The exact HTTPS app origin, currently `https://www.proverbs31cleaningcoservices.info` |
| `GUEST_CHECKOUT_ENABLED` | Leave `false` initially; see optional guest setup below |

Never put the service-role key in browser JavaScript, HTML, a public environment-variable prefix, Git, or chat. The API returns only the public key. The privileged key is used only by the backend to finalize uploads **after** checking the user's identity, file ownership, and actual file signature.

Redeploy after adding/changing variables. The project root remains `cinematic-preview/`; `vercel.json` installs with `npm ci`, builds with `npm run build`, and serves `dist/` plus the Node API function. Source migrations, environment files, and server code are not copied into the public static output.

For development, copy `.env.example` to `.env.local` inside `cinematic-preview/`, fill the values privately, then run:

```sh
cd cinematic-preview
npm ci
npm run build
npm run dev
```

Open `http://127.0.0.1:8766/`. The old Python static preview cannot run backend API functions.

## 5. Assign the owner safely

1. Visit `/sign-in.html` and sign in with the intended owner's email. Verify the email.
2. In Supabase SQL Editor, open `cinematic-preview/supabase/bootstrap-owner.sql`, replace `REPLACE_WITH_OWNER_EMAIL`, and run it.
3. Confirm that the expected verified user's ID was returned. Reload `/workspace.html`.

Owner access is checked against `private.owner_accounts` on the server/database. Customers cannot read or modify this table. Add your own verified account separately if the business authorizes developer access. Do not share the owner's login.

To remove an owner's access, delete the appropriate row from `private.owner_accounts` using the SQL Editor. Subsequent API calls will enforce the change.

## 6. Verify the connected workflow

Use two different customer test accounts plus an owner account:

- Owner can view the customer database, add manual bookings, set working days/capacity, block time, review private media, adjust quotes, and record actual payments received elsewhere.
- Customer A cannot see Customer B's bookings, contact details, notes, or files. A direct attempt to change prices, mark payments paid, or grant an owner role must fail.
- Booking requests use **server-calculated** starting prices. Deposits start unpaid; a confirmation never claims money was collected.
- The database checks capacity and locks scheduling changes transactionally. A recurring request reserves the **first four visits atomically**; if any is unavailable, the entire series request is rejected. Additional visits are not generated automatically yet.
- A customer can accept only the current reviewed quote revision. Adjustments and newly completed walkthrough uploads reset prior approval.
- A final balance can be issued only after review, customer approval, and visit completion. Payment records require an owner, a positive amount, and a unique request ID; repeated requests do not double-record a payment.
- Walkthrough files upload directly to private Storage with a scoped upload token. The backend checks ownership, actual file signature, and stored size/type before marking them ready. Preview links expire after 60 seconds. Test rejection, removal, quota errors, and signed-link expiry on the actual Supabase project.

The implemented tests use PGlite (a real embedded PostgreSQL engine) with Auth/Storage schema fixtures plus API authorization tests. They do **not** prove hosted Supabase email, Storage, CAPTCHA, or Vercel integration until the project is connected and these checks are run there.

## Optional guest checkout

Leave guest checkout disabled until the business is ready to handle guest requests and confirmations.

1. Enable anonymous sign-in in Supabase Auth.
2. Configure Supabase Auth CAPTCHA protection with Cloudflare Turnstile. Its **secret** belongs in Supabase's CAPTCHA settings. Add your app domain to the Turnstile widget.
3. Set the public `TURNSTILE_SITE_KEY` in Vercel and `GUEST_CHECKOUT_ENABLED=true`.
4. In SQL Editor set `public.business_settings.guest_checkout_enabled=true`.

Guests receive an anonymous session for submitting a request; they do not get a customer management portal. The database still requires a valid session, checks capacity, applies a per-identity booking limit, and calculates prices. CAPTCHA and platform rate limiting are necessary to limit anonymous-account abuse. Guest walkthroughs can be collected separately and uploaded by the owner. Secure guest invoice delivery will be connected with the payment/email provider, not with a public demo URL.

## Still separate from this backend connection

- **Stripe/PayPal/Square:** no processor is connected. Customers cannot simulate payments in connected mode. Owners can record money received externally. A real provider integration must verify signed webhooks and reconcile transactions before enabling online collection.
- **Business email:** booking, quote, completion, and invoice notifications are stored as `pending_provider` in the outbox. No delivery worker is enabled, so these have not been emailed. Native sign-in emails are handled separately by Supabase Auth.
- **Proverbs 31 Cal:** the website database owns bookings and availability. The dashboard supports whole days, date ranges/weeks, arrival windows, and custom hours. Its Open booking blocks panel generates 2-hour or 3-hour windows between the selected start/end times; checkboxes publish date-specific openings in `calendar_days`. An empty selection closes that date. Only full windows fit; leftover time is not offered. Existing bookings retain their times and count against every overlapping new window. Any custom-hour overlap closes the affected arrival window to new bookings. Range blocking is atomic and rejects conflicts with existing visits. Google/Apple `.ics` exports are snapshots; external edits do not change this schedule. No external calendar connection or automatic sync is configured.
- **Long-running recurring schedules:** only the first four visits are created; a future scheduling worker must generate more visits with the same conflict checks.
- **Launch policies:** confirm working hours, capacity, maximum advance booking (initially 365 days), laundry/file limits, cancellation/refund terms, pricing approval, privacy policy, retention/deletion procedures, and backups before taking real bookings. Orphaned/failed upload cleanup and data retention jobs must be configured before sustained production use.

## Technical references

- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Passwordless email authentication](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)

## Shared account portal

`sign-in.html` is the single passwordless entry point for customers and administrators. Legacy `account.html`, `admin.html`, and `final-payment.html` routes forward to the backend workspace, which sends signed-out visitors to the shared portal. `/api/app?route=me` determines the role using the verified session and private owner table. URL parameters and browser storage cannot grant owner access.

Production builds exclude the retired demo store, dashboards, browser media store, and demo bridges. The planner no longer auto-types fictional contact details or simulates account verification or payment. Missing backend configuration fails closed on every deployment. Public catalog copy and illustrative floor plans remain; transactional prices and calendar availability come from the backend.

## Owner pricing controls

Applied `cinematic-preview/supabase/migrations/002_owner_pricing.sql` to the hosted project on October 20, 2026, after explicit approval. Verified the function exists, anonymous execution is denied, and the existing $110 one-bedroom starting price and $100 Deep Cleaning adjustment are unchanged (zero pricing-change events). This adds `api_owner_price` for authenticated owners only; customers retain read-only catalog access. The dashboard's Pricing tab edits property/suite starting prices, the Deep Cleaning adjustment, and add-on amounts in USD. Each change records the previous/new cents and actor in the audit log. Stale edits are rejected, preventing one open dashboard from overwriting another owner's later change. Existing booking quote snapshots, reviewed balances, and payment records are preserved.

Connected Services and Plan My Care load the database catalog. The manual-booking form loads the same catalog. The Services page retains the approved published catalog only during unconfigured prelaunch; after connection, catalog errors hide the prices and direct customers to contact the company. The backend always calculates final booking-request estimates. Manual arrival blocks stay empty until availability succeeds; older responses cannot overwrite a newer date selection.

Resend setup is deferred at the user's request. No email sender or Vercel Supabase credentials have been installed as part of this pricing change. The pricing tab requires a real verified owner session after those connections are ready.

## Authentication held for later

The business database connection is enabled independently from authentication. Before opening customer accounts, configure Resend/custom SMTP, enable Supabase's email provider and new signups, finish the link/code templates, then set `AUTH_ENABLED=true` and redeploy. Assign verified owner accounts and test customer isolation and uploads before accepting bookings. Public catalog and quote routes can be checked while account routes return 503. No email service is connected by this database-only setup.

## Walkthrough, quote review, and notification preparation

The workspace now provides local photo/video previews, per-file upload progress, retry handling, room labels and notes, and client checks matching the six-file / 20 MB per-file / 80 MB per-booking limits. Uploads use short-lived signed storage URLs; finalization still verifies ownership and file content on the server. Hosted storage transfer must be tested with an authenticated customer before launch.

Customers see the starting estimate, explained adjustments, reviewed total, recorded payments, and remaining balance together. Explicit acknowledgement is required to accept the current quote revision. Later adjustments require renewed approval. Payment history reflects recorded external payments; no online payment processor is connected.

Cancellation and rescheduling requests require admin review. They do not automatically change the booking, impose fees, or promise refunds. Admin rescheduling uses the backend availability list.

Owner-only notification previews render branded HTML and plain text from `cinematic-preview/server/email-templates.cjs`. Authentication template sources are in `cinematic-preview/supabase/templates/`. These are preparation only: Resend, delivery workers, authentication email templates in Supabase, and live sign-in remain unconfigured/disabled. A future delivery worker must snapshot the relevant revision or suppress stale queued notifications before sending.

Validation: automated API, database, upload retry, file limits, totals, and template tests; isolated browser checks for quote acknowledgement, request submission, email preview, and a 390 px customer layout. No production customer records were created for these checks.


## Manual bookings and visit progress (October 20, 2026)

Migration `003_manual_bookings_progress.sql` adds `on_the_way` and `in_progress` to visit status while preserving existing bookings. Manual bookings collect first/last name, address, contact details, available visit block, owner-entered price, and separate pricing status. The owner may retain a starting estimate, prepare a reviewed price, or record an actual outside customer approval with required notes. This never records a payment. Manual guest bookings can have outside approval recorded later; all operations remain owner-only and audited. Customer dashboard cards and booking detail show Booked → Confirmed → On the way → Cleaning in progress → Completed. Awaiting walkthrough remains in the Booked stage; cancelled bookings show cancellation instead of progress. Completion retains the existing requirement for price approval.

Applied migration 003 to hosted Supabase successfully. No real customer/test booking data was inserted into production. Local database tests verify owner-only manual price controls, pricing snapshot/deposit amounts, required approval notes, all progress statuses, and denial to unrelated customers.


## Deposit and walkthrough milestones (October 20, 2026)

Applied `004_booking_milestones.sql` to hosted Supabase. A booking request stays Awaiting deposit until recorded deposit payments meet the starting deposit amount, then advances to Booked automatically. Admin review and explicit walkthrough approval confirm the booking; website bookings require a verified walkthrough upload. Manual bookings may use a documented external walkthrough review. On the way, Cleaning in progress, and manual Completed follow ordered owner updates. Completion still requires customer approval of pricing.

Post-cleaning media has a separate `purpose=completion`, can only be uploaded by an owner for an approved visit in progress (or to add more evidence before its invoice is issued), and automatically marks the visit Completed only after server verification. It preserves reviewed prices, quote acceptance, and payment amounts. Retries and additional completion evidence do not queue duplicate completion notices. Pre-cleaning walkthrough edits close once the visit is confirmed.

Isolated SQL-backed browser tests created a manual booking linked to a test customer account, recorded a test external deposit, reviewed and approved a verified walkthrough, accepted the quote from the customer dashboard, and advanced travel/cleaning status from the admin UI. A local validated sample completion file then completed the visit automatically. All test records stayed local. Live hosted storage transport and payment-provider webhook automation still require authenticated end-to-end tests and provider configuration; no payment provider is connected. Sign-in and email sending remain disabled.


Completion evidence is optional: admins can manually mark an approved visit in progress Completed without uploading media. Migration `005_late_completion_evidence.sql` permits owner completion evidence afterward, including after the final balance is issued. Late evidence does not reopen pricing, alter payments, or repeat completion notifications. Pre-cleaning walkthrough edits remain closed.


## Automatic customer dashboard updates

Signed-in customer workspaces refresh their authorized bookings through the existing authenticated API every eight seconds while visible, and immediately on focus, network reconnection, or returning to the tab. Hidden tabs pause checks; failures back off up to one minute. Requests do not overlap, stopped responses are discarded, and responses superseded by a customer action/reload are ignored. No new database publication, public subscription, or access permission is introduced.

Booking progress updates in place, including inside an open detail sheet. Draft form text, selected uploads, consent state, focus, and scroll position are preserved. Other changed booking details are available through an explicit View latest details control; stale quote acceptance is disabled. Profile forms are never rebuilt by background updates. Signed-out sessions stop refreshing. This feature remains inactive on production until sign-in is enabled.

Validated with 47 automated tests and an isolated SQL-backed browser test: an admin changed a visit from Confirmed to On the way, the open customer detail updated without refresh, and unsent change-request text remained intact.
