# Guest checkout — October 23, 2026

## Implementation

Guest checkout uses a CAPTCHA-verified anonymous Supabase identity solely to submit the booking and deposit. The customer does not register a password/email-login account. Full booking access is delivered separately through the private email link. An anonymous browser can poll only its own limited deposit receipt; it cannot read account dashboards, walkthroughs, owner notes or another guest's receipt. Stripe redirect-based methods return to the private guest receipt page, not account login. A signed-in account cannot accidentally submit under the guest radio selection.

The anonymous browser identity cannot change its stored guest email when submitting another booking: that would otherwise redirect earlier booking communications or invalidate their private links. The owner can correct an email through the existing verified administrative process.

CAPTCHA tokens are invalidated on errors, expiration and timeout. Failed script loads can be retried without discarding booking fields. Sign-in waits for security tools and disposes its widget when closed. Supabase must enforce the matching Turnstile secret; frontend validation alone is not security.

## Launch protection

The website/API countdown remains October 26, 2026 at 9:00 AM America/New_York. A database trigger independently denies anonymous booking inserts before that time, including direct Supabase RPC calls. CAPTCHA-protected anonymous authentication can be enabled beforehand without opening booking inserts. Owner manual bookings continue through verified owner access.

## Live setup still awaiting browser confirmation

Prepared Cloudflare managed widget “Proverbs 31 website authentication” in the signed-in technical account. Hostnames: proverbs31cleaningcoservices.info and www.proverbs31cleaningcoservices.info. No DNS/hosting transfer or paid plan is needed for this configuration. Pre-clearance remains off.

Do not mark setup complete until:

1. Create widget after the pending browser-policy confirmation. Keep its secret out of chat, Git and browser bundles.
2. Configure public TURNSTILE_SITE_KEY in the business Vercel project and deploy before enabling project-wide CAPTCHA. This also protects the existing owner/email-link dialog.
3. Save the matching secret under Supabase Authentication → Attack Protection → CAPTCHA / Turnstile; enable CAPTCHA protection, then anonymous sign-ins. Verify runtime settings and rejection of missing/invalid tokens.
4. Enable database business_settings.guest_checkout_enabled and Vercel GUEST_CHECKOUT_ENABLED only after protection is connected. Keep countdown/login opening instant unchanged.
5. Rehearse approved real CAPTCHA verification and guest flow privately. Test failed/expired tokens, account-vs-guest selection, correct receipt polling, sandbox deposit settlement, emailed one-booking access, revoked/expired links and mobile layout. Do not collect real money or expose a public preview bypass.

At this checkpoint code/build tests passed (149 tests, two environment-dependent skips). Added scoped receipt and guest database launch guard to production; anonymous auth and public guest checkout remain disabled until live configuration is completed. Existing private guest portal for owner-arranged bookings is separate.
