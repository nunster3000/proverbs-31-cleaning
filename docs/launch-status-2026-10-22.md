# Launch checkpoint — October 22, 2026

## Verified

- Public countdown still opens October 26, 2026, at 9:00 AM America/New_York (13:00 UTC). No live countdown setting or date changed during this rehearsal.
- Real existing-account and new registration email links were verified earlier. Current rehearsal used both verified test accounts against a restricted loopback entrance and real hosted APIs/storage.
- Eleven rollback-only hosted database/privacy/guest checks passed; fourteen real hosted API/storage assertions passed. Owner photo preview and full five-second video playback were observed. Customer dashboard updated to show reviewed media and approved price, with deposit still outstanding.
- Hosted fixtures, media and queued test emails were removed; calendar restored; temporary role and localhost callback removed; local test server stopped and temporary credential files removed. Gabrielle remains the sole admin.
- Native PostgreSQL concurrency: eleven assertions passed, including simultaneous block claims, manual/customer races, pattern overlap, rescheduling races and retries.
- Encrypted QA database/media restore passed with checksums and restored customer isolation; corrupted archive rejected. All QA restore files/keys and the disposable cluster were removed. This is not an active production backup.
- Added root Zoho SPF and initial non-enforcing DMARC in business Vercel DNS; preserved receiving and Resend records. Inbox placement still needs follow-up.
- Notification worker now shares the API's launch clock, retaining independent email and hold switches. Thirteen focused launch/notification/full-flow tests passed. Automatic customer emails remain disabled.

## Decisions left to Gabrielle in the dashboard

Launch preparation: content/prices, final booking/privacy policies and retention periods, backup preference, device/handover checks. Forms & agreements: questionnaire wording, signature style and automatic representative-signature authorization. Do not publish or sign business agreements on her behalf.

## Remaining dependencies before full operational launch

1. Production backups: owner-approved destination, recovery-key custody and secure database connection; first complete hosted backup and isolated Supabase restore verification. See backup-and-recovery.md.
2. Retention/deletion implementation matched to her approved rules. Manual request procedure is prepared in privacy-operations.md; automatic purge is not active.
3. Hosted signing/download rehearsal using her approved published agreement. Isolated agreement/version/rescheduling/PDF checks already pass; no unapproved production form was published.
4. Actual iPhone/Android camera selection, HEIC conversion, phone-video playback, interrupted mobile upload, navigation and Gabrielle's handover. Desktop-responsive previews do not replace these checks.
5. DNS/mailbox follow-up, final-domain login link expiry/replay follow-up, and final explicit approval for automatic notification/guest delivery switches. CAPTCHA remains explicitly deferred.
6. Payment integration and final release review, including search-engine indexing and operational monitoring/recovery ownership. No fees/refunds or payment receipts are inferred from redirects or test data.

The timed website/login release does not wait for these approvals. Public opening is armed; automatic customer notifications and guest access are separate disabled switches.
