# Walkthrough upload verification — October 20, 2026

## Results

62 standard tests passed, including new upload checks. The separate PostgreSQL concurrency suite is intentionally skipped in this run; it was verified separately during calendar testing. No production accounts, bookings, or storage objects were created. No application-rule changes were needed.

## Automated coverage

- Supported metadata: JPG, PNG, WebP, MP4, WebM, and MOV. HEIC and HTML are rejected.
- Per-file boundary: 20 MiB accepted; 20 MiB + 1 byte and empty files rejected.
- Booking quota: six active files and 80 MiB total, counting incomplete reservations. Removing a reservation restores capacity.
- Client progress events and three-minute transfer timeout configuration.
- Network, timeout, and HTTP failures retain the original reservation for retry, without consuming another file slot.
- A lost transfer response counts as success only when backend verification succeeds.
- Verification retry reuses the already transferred object.
- Signed upload destinations outside the configured storage project are rejected.
- Pending files cannot be previewed. Missing objects, wrong size/type metadata, failed verification fetches, and mismatched signatures do not finalize uploads.
- Finalization is server-only and idempotent; a ready upload creates one admin review item. Saving review clears that item.
- Existing privacy tests cover foreign file access, removal, and forged storage uploads.

## Visual mobile-layout checks

Used the actual customer and admin workspace UIs inside a responsive 390px frame, with local test identities and the application's SQL migrations. Local multipart transport and in-memory file storage stood in for Supabase storage; the production browser upload helper was separately exercised by automated fault tests.

Selected a real 70 KB JPG and the existing 5.7 MB, five-second MP4 through the browser file chooser. Both uploaded, retained room labels/notes, and appeared as Verified. Admin received the walkthrough review badge, viewed the JPG, and played the MP4 through to 0:05. Saving admin review persisted its notes and cleared the admin review badge. Customer received a Walkthrough reviewed badge automatically.

Evidence files (local, not deployed): `tmp/upload-photo-mobile.png` and `tmp/upload-video-mobile.png`.

## Remaining launch checks

With email sign-in still disabled, this does not establish hosted Supabase upload/signing behavior or native phone camera selection. After sign-in is available, repeat with customer and admin accounts on actual iPhone and Android devices, including a camera photo, short phone video, mobile-network interruption, and expired private preview links. MOV acceptance does not guarantee every phone video codec will play in every browser; the decoded playback checked here was MP4.

The current interface tells customers to export HEIC as JPG before uploading. Automatic HEIC conversion and video transcoding are not implemented.
