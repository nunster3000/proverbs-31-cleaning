# Customer account deletion

Implemented October 23, 2026. Public access remains behind the unchanged October 26, 9 AM Eastern launch countdown.

## Customer behavior

My Profile offers two choices when there are upcoming appointments:

- Keep the appointments and automatically delete after every visit and payment is resolved. The customer can withdraw this scheduled deletion while it is waiting, and retains access for uploads, signing and payment. New bookings are blocked until they withdraw the request.
- Cancel upcoming, unstarted appointments and automatically delete once financial resolution completes. At least 72 hours before the Eastern appointment start, refund all payments. Inside 72 hours, retain no more than the agreed booking deposit and refund payments above it. The server recalculates this summary; changed bookings, payments or the 72-hour boundary require reviewing a fresh summary. Cancellation cannot be undone through “keep my account.”

No business-owner approval is required. A fresh email authentication within 10 minutes, acknowledgment and typing DELETE are required. This is enforced in both the HTTP route and database RPC. The owner account and anonymous guest sessions cannot use this customer-account control.

Refunds, disputes, inconsistent payment records, processing checkouts, unresolved final prices and unpaid invoices prevent removal. Completed visits must have an accepted final price, issued invoice and exact payment reconciliation. A started or elapsed visit must be resolved rather than silently cancelled. Existing cancellations outside this workflow with paid funds require refund reconciliation; the system does not guess the original cancellation time.

## Payments and retries

Stripe refunds use a durable per-payment refund record, persisted provider reference, idempotency key and metadata lookup before creation. A retry after a lost response or expired Stripe idempotency window must discover the previous refund rather than issue another. Unexpected refunds, disputes, unrelated payment metadata and unexpected saved Stripe Customer profiles fail closed for technical reconciliation. The application currently creates neither reusable Stripe Customers nor saved cards. It retains transaction evidence, including Stripe transaction references; it does not erase Stripe financial history or claim that Stripe deletes every card attribute from historical charges.

Cash or other externally recorded payments requiring a refund appear in Admin → Privacy & operations. Gabrielle records the actual completed refund reference; this records financial resolution rather than approving account deletion. Pending or failed Stripe refunds remain pending, not falsely paid.

`/api/account-maintenance` runs every five minutes, authenticated by CRON_SECRET, and is enabled with ACCOUNT_DELETION_ENABLED=true. Durable leases fence overlapping workers. Eligible requests normally finish on the next maintenance run, rather than waiting for manual approval. A technical or processor failure retries and is included in the existing operations monitor. No real-money refunds were performed during testing.

## Removed and retained data

Before removing Auth, the worker freezes the account and denies old JWT access through database RLS, revokes private guest grants and waits for in-flight notification leases. It removes walkthrough/completion objects and metadata, operational booking notes, customer contact/profile/access/pet details, email snapshots, read states and private request notes. It then hard-deletes the Auth account and its refresh sessions. A private HttpOnly receipt can report progress without restoring access. Former account IDs are not automatically linked if the same email signs up again.

Minimal archived customer and service references, invoice/payment/refund history, service address/name needed for those records, accepted pricing/policy snapshots and original signed agreements remain. Signed forms are not rewritten; they can contain the original information the customer signed. This retention is explicitly disclosed before deletion. Unexpected ownership of business website assets requires safe reassignment rather than deleting the business’s photo as if it were a personal upload.

Signed upload URLs can outlive Auth deletion. The exact deleted booking prefixes are swept again for 24 hours to remove any late objects. They are inaccessible through the deleted account during that period.

Gabrielle receives a minimal deletion email and an unread dashboard notice, with archive reference and no deleted contact data. Admin displays outstanding refund work separately.

## Backups and recovery

Deleting the operational account does not rewrite existing encrypted backup snapshots or erase necessary signed/billing records. The private account_closures journal is included in subsequent database backups. Before restoring an older backup into service, obtain the latest deletion journal from the current database/latest available encrypted backup, reapply every completed or purging account tombstone and data-removal step, and verify Auth, RLS and storage cleanup before opening access. Never expose a restored pre-deletion account. Recovery password custody and the business retention decisions remain pending; this feature does not claim those approvals are complete.

## Verification

- Isolated database: owner/guest exclusion, cross-customer isolation, no admin approval, full and partial refund calculation, exact 72-hour boundary, fresh-auth requirement, keep/withdraw, no new bookings during closure, unresolved invoice/payment holds, hard-delete FK behavior, stale-JWT denial, media removal, preserved signed evidence, and owner notification read states.
- Mock processor: known refund resumption, disputed/shared-profile refusal, storage failure before Auth removal, cron authentication.
- Mobile browser: 390-pixel customer controls, acknowledgment/DELETE validation and scheduled-deletion state using fictional data only.
- No live account deletion, payment or refund was executed for verification. Production migration preserved three Auth users, zero bookings and the sole owner.
