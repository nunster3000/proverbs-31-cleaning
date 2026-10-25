# Email sender routing

Business notifications (including guest access, class/cleaning updates, receipts and photo notices) use noreply@proverbs31cleaningcoservices.info. Customer notification Reply-To remains Gabrielle's business address.

The optional Supabase Send Email hook at https://www.proverbs31cleaningcoservices.info/api/auth-email uses signup@proverbs31cleaningcoservices.info for signup confirmation and noreply for magic-link login. It preserves the branded templates and canonical customer/owner callback paths. It verifies Standard Webhooks signatures, rejects stale/forged messages, and uses Resend idempotency keys. It returns 503 until configured. No token, signing key or recipient is logged.

## Activation — pending secure configuration

1. Configure the HTTP Send Email hook URL above in Supabase Authentication / Hooks. Generate the hook signing secret using Supabase's UI.
2. Enter the same secret in Vercel Production as SEND_EMAIL_HOOK_SECRET, retaining the v1,whsec_ prefix supplied by Supabase. Keep the existing domain-scoped RESEND_API_KEY. Redeploy before enabling the hook.
3. Enable the hook only after both configurations match. The hook replaces SMTP delivery; existing SMTP remains the fallback configuration when the hook is disabled. Do not change launch, email-provider or signup enablement flags.
4. Test signup and existing-account magic links with a user-authorized test mailbox and verify inbox delivery, both From addresses, single-use callbacks and owner routing. Disable the hook to roll back if delivery fails.

The current application is passwordless. This handler supports its signup and magiclink actions only; implement and test other Supabase auth actions before enabling password recovery, invitations, reauthentication or email-change flows. It deliberately rejects unsupported actions rather than sending incorrect verification links.

Reference: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
