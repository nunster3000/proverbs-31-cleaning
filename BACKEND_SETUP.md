# Connect the Supabase backend

The backend code is implemented, but there is **no hosted Supabase project connected yet**. The existing live site stays in fictional demo mode until configuration is supplied. No demo customers, local photos, or simulated payments are migrated into the real database.

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
- Set the Site URL to `https://proverbs-31-cleaning.vercel.app` for the current deployment.
- Allow `https://proverbs-31-cleaning.vercel.app/sign-in.html` as a redirect URL. Add your custom domain's equivalent when it is ready. For local testing only, allow `http://127.0.0.1:8766/sign-in.html`.
- In the email magic-link template, include both the standard `{{ .ConfirmationURL }}` link and the `{{ .Token }}` code so the booking dialog can verify a code without losing the booking form.
- Configure custom SMTP before real customer use. Supabase's built-in mail service has testing restrictions and rate limits; it is not the business notification delivery system.

Sign-in uses verified email links/codes with PKCE. No customer password is stored by this app. A user-provided role or browser setting never grants owner access.

## 4. Configure Vercel environment variables

In this project's Vercel settings, add these **server environment variables** for the intended environment:

| Variable | Value |
|---|---|
| `BACKEND_ENABLED` | `true` only when the migration and authentication setup are ready |
| `SUPABASE_URL` | The project's HTTPS API URL |
| `SUPABASE_ANON_KEY` | Its public anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Its server-only service-role/secret key |
| `APP_ORIGIN` | The exact HTTPS app origin, currently `https://proverbs-31-cleaning.vercel.app` |
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
