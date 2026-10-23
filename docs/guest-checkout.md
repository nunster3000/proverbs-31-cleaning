# Guest checkout — connected October 23, 2026

## Connected configuration

- Cloudflare managed Turnstile widget: “Proverbs 31 website authentication”, in the signed-in technical account. Allowed hostnames are proverbs31cleaningcoservices.info and www.proverbs31cleaningcoservices.info; no localhost/preview hostnames or pre-clearance bypass were added. DNS and hosting remain unchanged.
- Public site key configured in the business Vercel project. The secret is saved in Supabase Authentication → Attack Protection, provider Turnstile. It is not part of app source, public bundles or Vercel client configuration.
- Supabase runtime confirms email, registration and anonymous sign-in enabled. Missing/invalid CAPTCHA tokens are rejected for both email OTP and anonymous signup.
- Database guest checkout and Vercel GUEST_CHECKOUT_ENABLED are armed. The application countdown still forces guest booking, login and customer notifications closed before October 26, 2026, 9 AM America/New_York.
- A private database launch trigger also rejects anonymous booking inserts before that exact instant, including direct Supabase RPC attempts.

## Customer behavior

Guests do not create a password/email-login account. CAPTCHA creates a restricted anonymous browser identity for booking submission and deposit payment. Full booking actions use the private link delivered to the booking email. The browser can poll only its own limited deposit receipt; another guest's receipt, customer dashboard and owner notes remain unavailable. Stripe redirect methods return to guest-receipt.html rather than account login.

A signed-in account cannot accidentally submit under the guest radio choice. Reusing an anonymous session with a different email is rejected so earlier booking communications cannot be redirected. Gabrielle can correct contact details through the existing verified administrative process.

Security checks handle missing, failed, expired and timed-out tokens. Failed script loads can be retried without discarding the booking fields; tokens reset after failed requests. Narrow phone dialogs use compact CAPTCHA sizing. Email-link sign-in remains passwordless and also passes CAPTCHA to Supabase.

## Verification

Real production-domain Turnstile verification was accepted inside the browser by Supabase anonymous signup. The temporary guest identity saw zero customer/booking records and its direct booking attempt was rejected by the database launch clock. No booking, payment, published policy or signature was created. The exact labeled test identity was deleted, and the temporary rehearsal screen was removed afterward. Screenshot: tmp/guest-captcha-live-pass.png (local evidence, not a public website asset).

The isolated database integration test covers the guest switch, prelaunch rejection, successful post-launch booking, service-only deposit reconciliation, a limited receipt showing the paid deposit, guest email queue recipients, private-link issuance/exchange and rejection of foreign receipt access/email changes. Other guest upload/price/signature/revocation tests remain in the full suite. Test policy publication happens only in the disposable database; Gabrielle's production policy approval remains required before payment.

No real-money charge was performed. Existing Stripe sandbox browser tests verify embedded card submission; the new guest-specific receipt/redirect and database settlement paths are tested separately. A live post-launch booking is not claimed before the countdown ends.
