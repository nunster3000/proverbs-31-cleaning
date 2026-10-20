# Launch readiness review — October 20, 2026

## Completed

- Removed the visible “About this demonstration” privacy heading.
- Corrected Contact to Gabrielle Jackson and added the confirmed email: gabriellejackson@proverbs31cleaningcoservices.info.
- Retained flyer phone (346) 869-2479 and “Atlanta and surrounding areas”; added address-availability confirmation language. No unapproved city/ZIP coverage was invented.
- Added Booking and service information, linked from public pages: starting estimates, 50% starting-service deposits, walkthrough/price review, change requests, first-four recurring reservations, and current contact-only booking/payment arrangements.
- Retained explicit no-automatic-fee/no-automatic-refund behavior; did not invent notice periods, nonrefundable deposits, guarantees, or fee amounts.
- Clarified the interim privacy notice and its current launch status. This is not the final account privacy policy.
- Removed stale public-source demonstration styling and guest-email/checkout wording. Replaced outdated repository instructions describing local simulated bookings.
- Production build excludes retired prototype scripts, design prompts/manifests, and proof images. Root deployment ignore excludes local QA servers, reports, tests, and docs from uploaded project sources.
- Public navigation checks cover local links and expected contact details. Launch, pricing, workflow, and privacy test suites remain enabled.

## Business confirmation still required before account registration opens

1. Confirm that (346) 869-2479 is the current customer-facing phone number. The owner name/email are confirmed in the conversation, but the phone comes from the original flyer.
2. Confirm Atlanta-area city/ZIP boundaries, any travel charges, and whether quotes must be manually checked for location. The website does not enforce a geographical boundary today.
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
