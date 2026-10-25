# Email sender routing

Business notifications (including guest access, class/cleaning updates, receipts and photo notices) use noreply@proverbs31cleaningcoservices.info. Customer notification Reply-To remains Gabrielle's business address.

The optional Supabase Send Email hook at https://www.proverbs31cleaningcoservices.info/api/auth-email uses signup@proverbs31cleaningcoservices.info for signup confirmation and noreply for magic-link login and password-reset emails. It preserves the branded templates and canonical customer/owner callback paths. It verifies Standard Webhooks signatures, rejects stale/forged messages, and uses Resend idempotency keys. It returns 503 until configured. No token, signing key or recipient is logged.

## Configuration and rollback

1. Configure the HTTP Send Email hook URL above in Supabase Authentication / Hooks. Generate the hook signing secret using Supabase's UI.
2. Enter the same secret in Vercel Production as SEND_EMAIL_HOOK_SECRET, retaining the v1,whsec_ prefix supplied by Supabase. Keep the existing domain-scoped RESEND_API_KEY. Redeploy before enabling the hook.
3. Enable the hook only after both configurations match. The hook replaces SMTP delivery; existing SMTP remains the fallback configuration when the hook is disabled. Do not change launch, email-provider or signup enablement flags.
4. Test signup and existing-account magic links with a user-authorized test mailbox and verify inbox delivery, both From addresses, single-use callbacks and owner routing. Disable the hook to roll back if delivery fails.

The application supports password sign-in and registration alongside email links. Existing email-link users can request a password-reset link to set their first password. Signup still requires email confirmation. Recovery callbacks verify a recovery token, remove it from the address bar, and show the new-password form before allowing dashboard navigation. New passwords require at least 12 characters in the UI; Supabase applies its configured server policy.

The active HTTP hook supports signup, magiclink, and recovery. Recovery messages use the noreply sender and a type=recovery callback on the canonical customer or owner sign-in page. Invitations, reauthentication, and email-change actions remain unsupported. Automated tests cover reset sender routing, signature validation, callback handling, matching passwords, and failed updates. No live customer password has been changed by these tests.

Reference: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
