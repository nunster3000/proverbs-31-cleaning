# Launch readiness review — October 20, 2026

## Completed

- Removed the visible “About this demonstration” privacy heading.
- Corrected Contact to Gabrielle Jackson and added the confirmed email: gabriellejackson@proverbs31cleaningcoservices.info.
- Removed the phone number at the user’s request. Retained the approved Atlanta-area wording and added manual address/distance review. No city/ZIP boundary is enforced.
- Added Booking and service information, linked from public pages: starting estimates, 50% starting-service deposits, walkthrough/price review, change requests, first-four recurring reservations, and current contact-only booking/payment arrangements.
- Retained explicit no-automatic-fee/no-automatic-refund behavior; did not invent notice periods, nonrefundable deposits, guarantees, or fee amounts.
- Clarified the interim privacy notice and its current launch status. This is not the final account privacy policy.
- Removed stale public-source demonstration styling and guest-email/checkout wording. Replaced outdated repository instructions describing local simulated bookings.
- Production build excludes retired prototype scripts, design prompts/manifests, and proof images. Root deployment ignore excludes local QA servers, reports, tests, and docs from uploaded project sources.
- Public navigation checks cover local links and expected contact details. Launch, pricing, workflow, and privacy test suites remain enabled.

## Business confirmation still required before account registration opens

1. Phone is intentionally unpublished. Gabrielle may add a customer-facing phone later through Website content.
2. Atlanta and surrounding areas is approved. Gabrielle decides whether to approve each address based on distance. Any future travel charges require her explicit policy.
3. Approve cancellation/rescheduling notice requirements and how already paid deposits/final payments are handled. No automatic fees or refunds are implemented.
4. Set customer-record, walkthrough and completion-media retention periods, who handles deletion/correction requests, and which payment/audit records must remain. Implement the corresponding deletion/retention process before promising it publicly.
5. Approve the final privacy notice describing fields collected, purposes, owner access, Supabase/Vercel/email providers, session storage, and retention/deletion practices. The current notice keeps online sign-in disabled and explains that online terms will be updated before registration opens.
6. Confirm any business service exclusions, access requirements, late/no-access handling, damage/complaint contact process, and recurring visit/payment terms that she wants published. Do not infer these from common cleaning-industry practices.

## Technical launch gates retained

- Resend/custom sender is not configured; email sign-in, signup/guest booking, and outbound email remain disabled.
- Online payment processor is not connected. Only externally received payments are recorded; request submission collects no payment.
- Before enabling accounts: final approved privacy/booking information; delivery and magic-link expiry/routing tests; customer/admin ownership checks with hosted sessions; real hosted media transfer; physical iPhone/Android checks.
- The deployment remains noindex/nofollow. Remove that header only when the business approves public launch.
- Confirm the business-owner website admin identity before owner handover; Vercel permissions are separate.

## Privacy review reference

FTC business guidance emphasizes accurate privacy promises and a written data-retention policy that specifies what is retained, for how long, and how it is disposed of. This review does not certify legal compliance or substitute for business approval.

https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business
https://www.ftc.gov/business-guidance/privacy-security/consumer-privacy

## Editable business pages

About Us now has a company introduction, owner introduction and public photo layout. Owner-only Website content controls update About Us and Contact without code. The phone defaults to blank; owner biography and photo are optional until Gabrielle supplies them. Content changes use revision checks and an audit log. Owner business photos use a separate public site-media bucket; customer walkthroughs remain private. New controls remain behind disabled sign-in until provider setup.

Browser verification: published and cleared a fictional phone in the isolated editor; Contact displayed a `tel:` link while populated and no link after clearing. Also saved an isolated owner biography/photo, verified public rendering, then restored blank biography/photo fields. No fictional content or phone was saved to production.
