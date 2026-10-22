# Backup and recovery — prepared, production activation pending

## Verified in isolation on October 22, 2026

Installed PostgreSQL 17 and age as local developer tools. No operating-system database service was enabled. A disposable loopback-only cluster passed all 11 native booking/privacy/concurrency assertions, then an encrypted recovery rehearsal:

- Dumped the populated QA database and included separate sample JPG/MP4 bytes plus SHA-256 checksums.
- Encrypted the archive with age using a disposable QA identity; rejected an altered encrypted archive before restoration.
- Decrypted the valid archive and verified exact database/media checksums.
- Restored to a separate empty QA database; compared booking/customer/notification counts and RLS table inventory.
- Verified restored RLS still hides a known foreign booking, the test customer is not an owner, and authenticated users still lack direct UPDATE privileges.
- Removed the restore database, archive, plaintext files and QA encryption identity. Stopped and removed the disposable database cluster.

Reproduce with `tests/postgres-concurrency.test.cjs` followed by `tests/postgres-recovery.test.cjs`; both accept only explicitly named loopback `p31_qa_*` databases. This establishes the tested encryption/recovery mechanics, not an existing production backup or a completed Supabase-to-Supabase disaster recovery.

## Gabrielle's decision stays in Admin → Launch preparation

Choose provider-managed or encrypted external backups and a recovery contact. The dashboard preference does not create backups, purchase a plan, generate a production encryption identity or select an off-site storage account.

Production activation requires a business-owned backup destination, recovery-key custody separate from the backup, an approved schedule/retention period and secure database connection access. Do not put database passwords, server keys or encryption identities in dashboard notes, GitHub, chat, or Vercel's public output. No production database password was reset during this work.

## Production procedure after those prerequisites

1. Use the provider's current supported Supabase backup/restore procedure. Preserve roles, schema, data, this repository's migrations and custom auth/storage policies. Record the app commit and database migration version.
2. Export actual private walkthrough/completion bytes and public business-media bytes separately, with an object-path, size, MIME and checksum inventory. Include signed agreement records and their immutable form/policy snapshots in the database export. A database dump contains object metadata, not the media bytes.
3. Encrypt the complete staged package to the business-owned recipient; keep the decryption identity in a separate business-controlled recovery location. Restrict temporary plaintext to a private operator directory and remove it after verification. Never use a Git repository or public bucket as backup storage.
4. Upload only the encrypted package to the chosen off-site destination. Verify it is recoverable using the documented recovery credentials and record the successful backup time/checksum outside the same failure domain.
5. Restore first to an isolated Supabase project with sign-in, automatic emails and payment delivery closed. Follow Supabase's managed-schema instructions rather than overwriting a live project's auth/storage schemas blindly.
6. Verify owner/customer isolation, private-bucket status and policies, booking/calendar state, immutable signatures, object checksums/playback, queue state and app compatibility. Configure the destination's own auth callbacks/provider secrets; never enable a copied pending notification queue by accident.
7. Record measured restoration time and any data gap. Only then mark the production backup arrangement operational. Run future recovery rehearsals on the business-approved schedule.

The current project is Free. Supabase recommends regular CLI exports and off-site backups for Free projects; paid daily database backups also omit Storage object bytes. No plan was purchased or enabled here.

References checked October 22: [Supabase backups](https://supabase.com/docs/guides/platform/backups), [Supabase CLI backup/restore and storage migration](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
