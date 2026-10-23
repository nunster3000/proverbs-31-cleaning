# Backup and recovery — encrypted Backblaze backups operational

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

## Backblaze free setup — selected October 22, 2026

Technical account: `khris.nun@proverbs31cleaningcoservices.info`, as requested by Khris. Keep the live launch countdown and application authentication settings unchanged. This setup operates outside Vercel and does not require a website deployment.

Prepared source: `ops/backups/backup.py` and `ops/backups/workflow.yml`. **Connected:** Production database and Storage export access, private B2 encrypted repository, private GitHub repository secret and enabled daily schedule. GitHub-hosted run #1 completed successfully; source revision `0f4f135` verified independent runner access. Revision `48d89e0` optimizes media snapshots and passed local encrypted media/restore tests plus another real production export. Hosted recheck 39840850552 passed. Technical owner still needs to confirm the separate password-manager/business recovery copy.

Created the private B2 bucket `proverbs31-production-backups-2026` in US East 005, initialized its restic encrypted repository and verified an off-site non-customer fixture upload/download/decrypt/checksum round trip plus a full repository data check. The restricted application key is scoped to this bucket. A labeled `connection-test` snapshot remains as setup evidence; it is not a production backup. Supabase media listing is verified (two buckets, zero objects at setup). The existing Supabase password was entered through a hidden local prompt and its PostgreSQL 17.11 session-pooler connection was verified. No Supabase password was reset.

Created private GitHub repository `nunster3000/proverbs31-private-backups` and committed the automation, gated by `BACKUPS_ENABLED=true`; the variable is now enabled and the first hosted run was dispatched. Credentials are staged outside the project in an owner-only local configuration for secure transfer. A separate owner-only recovery-password file was generated; the technical owner must save it in a password manager/business recovery location before activation. No credentials are committed, and no website deployment/countdown/authentication changes were made. The daily trigger is 08:17 UTC (4:17 AM Eastern during daylight saving time, 3:17 AM during standard time). It uses GitHub-hosted runners; the technical laptop does not need to stay on.

The automation uses restic authenticated encryption and deduplication for both database dumps and media bytes. It restores only the preceding database/manifest snapshot into an ephemeral private runner directory, compares the media inventory, downloads changed/new objects from Supabase into separate encrypted media snapshots, captures the current database and non-password roles, then uploads an encrypted database/manifest snapshot. Unchanged media bytes are not downloaded from B2 each day. Each inventory record includes the original object path, content checksum and media snapshot ID. Private object names remain inside encrypted manifests. Temporary plaintext is deleted on normal completion or failure; hosted runners are ephemeral. Raw provider/command errors are suppressed to avoid credentials or customer details in Actions logs. Failure exits nonzero. Do not enable debug logging.

### Activation checklist

1. User completes Backblaze account creation, password entry and verification. Enable account MFA. No paid plan/card is required for the initial free storage allowance.
2. Create a **private** dedicated B2 bucket, without automatic expiry rules that can corrupt the restic repository. Create a bucket-restricted application key for the backup operator (list/read/write; deletion only if retention/pruning is enabled). Never expose the master account key. Use the bucket's actual S3 endpoint: `s3:https://s3.REGION.backblazeb2.com/BUCKET`.
3. Create a separate **private** business automation repository. Do not enable this schedule in the public website repository. Copy the prepared two files there and configure repository secret `BACKUP_CONFIG` with the approved JSON configuration and repository variable `BACKUPS_ENABLED`. Keep the variable unset/false until initial verification. Repository secrets avoid paid private-environment requirements. Limit repository write access: writers can alter a workflow that receives secrets. Use a Supabase session-pooler connection (port 5432) and database password entered securely, never chat. Database credentials and storage service credentials have privileged read access and require restricted custody.
4. Generate a strong unique restic repository password. Save it in the technical owner's password manager and a separate business-controlled recovery copy. Save the B2 account recovery details independently. Losing this password makes the encrypted backups unrecoverable. Do not commit it or store it inside the backup repository.
5. Initialize the restic repository once using the same destination/password. Run the workflow manually before enabling its daily 08:17 UTC schedule. The script refuses a missing/uninitialized repository; it will not silently initialize a replacement if credentials or destination change.
6. Perform an actual off-site download/decrypt/restore check. Use `restic restore <snapshot> --target <isolated-directory>`, locate `inventory.json`, map each original bucket/object path to its inventory `snapshot_id`, restore that media snapshot separately, and locate its SHA-256-named file, and verify every stored content checksum. Inspect `database.dump` with `pg_restore --list`; restore into an isolated compatible Supabase project following its managed auth/storage schema instructions. Do not enable restored pending emails. Existing local QA tests do not replace this hosted check.
7. Enable Actions failure notifications for the technical account and verify a deliberately failed *credential-free fixture* run produces an alert. GitHub schedules are best effort, not a guaranteed execution SLA; check last successful snapshot regularly.
8. Initial retention proposal: 14 daily and 4 weekly snapshots. Apply `restic forget --tag p31-production --group-by host,tags --keep-daily 14 --keep-weekly 4 --prune` only after a verified restore and retention approval. Until then no snapshot is automatically deleted. Media snapshots must not be pruned without reference-aware garbage collection across every retained manifest; the example command targets only database/manifest snapshots. Historical snapshots consume space even after source media is deleted.
9. Monitor B2 total stored bytes, restic repository health, GitHub minutes and Supabase egress. Alert before 8 GB B2 use; the 10 GB free allowance is not unlimited and this script is not a provider billing cap. The per-run source-download guard defaults to 1 GiB; it is not a monthly egress cap. Set account spending caps/alerts where available. Revisit storage/retention before live media or free allowances fill.

Local tests cover recursive media listing, missing-credential refusal, private-error redaction, real restic encrypted snapshots/restoration, wrong-password rejection and unchanged-media download skipping. Hosted execution and production recovery remain pending credentials/account setup.

### First production export and off-site verification

On October 22 a real production snapshot `11679445` was encrypted and stored in B2. The downloaded/decrypted archive was 561,469 bytes and fully readable by PostgreSQL 17 pg_restore; its inventory contains the public customer and booking tables. The source had two storage buckets and zero media objects, so real customer-media bytes were not present to restore. The entire encrypted repository passed `restic check --read-data`; a separate labeled non-customer fixture demonstrated file upload/download/decryption/checksum verification. Temporary plaintext export/restore files were deleted afterward. Raw deduplicated repository footprint was about 105 KB at setup.

This verifies an actual off-site production export and archive integrity. It does **not** claim a complete restore into a new hosted Supabase project; that broader disaster-recovery rehearsal remains separate. Do not overwrite production for a recovery test.

### Operational cautions and custody

The Backblaze account is technical-owner controlled using the business work email. No paid plan was activated by this setup. Keep usage within B2 storage/download/transaction allowances, Supabase source transfer allowance and the GitHub account's shared runner-minute allowance. Unchanged media remains offsite, avoiding repeated full-media downloads. Retained snapshots still grow; no automatic destructive pruning has been enabled. Use Backblaze Caps & Alerts and review retention/capacity as bookings grow.

Backup workflow failures produce failed GitHub Actions runs. The technical owner should enable and verify GitHub Actions failure email notifications in their GitHub notification settings; an independent website freshness monitor was connected October 23 (see launch-closeout-2026-10-23.md); delivery of an actual incident alert has not been claimed.

The local `RECOVERY-KEEP-PRIVATE.txt` contains the encryption password and repository address; it is outside the project with mode 0600. The owner was asked to save it in a password manager and a separate business recovery copy. Never put it into the backup bucket, repository contents or chat. After hosted configuration is verified, remove the temporary local config containing database/API/application credentials; preserve the recovery password until its independent custody is confirmed.

Backblaze Caps & Alerts verified in the live account: storage cap $0.00 / 10 GB, daily download cap $0.00 / 1 GB, Class B and Class C transactions each 2,500/day. All listed alert checkboxes are enabled for the business work email. The console says alerts are sent at 75% and 100% of data caps. No paid cap increase was made. If a cap is reached, new backup operations may fail until capacity/usage is addressed; the technical owner must respond to alerts rather than assuming backups continue indefinitely.

## October 23 recovery and monitoring verification

Retrieved a production restic archive from Backblaze and restored the public/private/auth/storage schemas into a fresh disposable PostgreSQL 17 Unix-socket cluster: zero restore errors. Verified Auth users, the owner role, private Storage bucket, RLS tables, owner detection, customer isolation and restricted direct writes. No production records were restored over or changed. The temporary cluster was removed. `ops/backups/rehearse-local-restore.py` repeats this local archive rehearsal. Hosted Supabase infrastructure/provider recovery remains a separate runbook task. Current production media count was zero; fixture tests separately prove media snapshot retrieval/checksum matching and rejection of the wrong encryption password.

Backup runner now records service-only health. Vercel checks every six hours, alerts the technical work email for missing/stale backups (>36 hours), latest failure or terminal email queue jobs, and suppresses repeat alerts for 24 hours after provider acceptance. It runs before website launch. This monitor shares the application/Supabase failure domains; it is not a separate external uptime service. Recovery password custody still awaits the technical owner.
