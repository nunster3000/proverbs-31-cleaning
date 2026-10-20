# Home-access authorization

Customer flow: deposit → walkthrough review and confirmation → access authorization badge → review business-supplied form → typed full name and both acknowledgements → signed receipt → On the way allowed. Signing does not approve pricing or collect payment.

Gabrielle manages the wording in More → Access authorization. The editor starts empty in production. Publishing requires the owner’s approval checkbox and creates a new immutable form version. A booking uses the version assigned at confirmation; an already-confirmed booking without an assigned version receives the current active version when signed. Updating the master form does not rewrite an existing signed agreement.

Migration 011 adds RLS-protected form/signature tables, owner-only publishing, customer-only signing RPCs, the customer attention count, and a database trigger preventing transition to On the way without a matching signed receipt. A signed receipt binds the form version, customer account, typed name, server time, acknowledgements, and visit snapshot. Address/date/arrival changes invalidate current authorization and require signing again; prior records are retained. Cancelled visits cannot be signed. Administrators cannot sign on a customer’s behalf. Guest/manual customers without an account need an agreed separate authorization process before their visits can use this workflow; no admin override has been added.

No production form text or signatures are seeded. Sign-in stays disabled. Gabrielle’s actual permission form and approved retention practices remain launch prerequisites. This implements recordkeeping and signing controls; it does not determine the legal sufficiency of the form.

Verification: SQL tests cover unauthorized publishing/signing, cross-customer access, required acknowledgements, stale visit/form rejection, immutable receipts, repeat submission, preserved versions, travel gating, reschedule invalidation and badge clearing. Browser testing uses a clearly marked disposable QA form in isolated local storage/database, never the production database.

Deployment order: approve/apply migration 011 in Supabase, deploy application, add approved business form, and test with verified accounts once email authentication is available. Until migration 011 is applied the new UI shows setup pending; the backend travel restriction is not active. Do not enable launch/sign-in before completing deployment and acceptance testing.
