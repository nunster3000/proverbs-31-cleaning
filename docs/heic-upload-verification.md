# Automatic iPhone photo conversion — October 20, 2026

HEIC and HEIF selections are converted locally to JPEG before preview, reservation, or upload. File extensions and HEIC/HEIF MIME variants are recognized, including empty or generic MIME types. JPG, PNG, WebP and video selections bypass the converter. The original file is unchanged.

The decoder is bundled separately and downloaded from this website only when needed. It runs in a worker via heic-to's CSP build; no external conversion service receives photos. Quality is 0.88. Canvas export produces a fresh JPEG rather than preserving source EXIF metadata. The JPG filename and original last-modified timestamp are retained.

Both customer walkthroughs and admin completion evidence use the same preparation helper. Upload remains disabled during conversion; changing selections invalidates stale conversion results. Conversion failures leave an actionable retry message. Source and converted size/quota validation apply before a storage reservation is requested. The private storage bucket continues accepting only the existing supported formats; raw HEIC is not stored.

Validation:

- 66 standard tests passed; optional separate PostgreSQL suite skipped in this run.
- Tests cover HEIC/HEIF detection, JPEG naming/type, source preservation, limits before and after conversion, decoder failure, and lazy-loader retry.
- Generated an HEIC fixture locally from the existing test room JPG using macOS sips.
- Selected that HEIC through the browser file chooser in the 390px customer workspace.
- Confirmed the converted JPG preview and successful upload as `iPhone living room · upload-room-test.jpg · Verified` against isolated SQL/storage test fixtures.
- Evidence: `tmp/heic-converted-mobile.png` (not deployed).

Actual iPhone/Android camera selection and hosted Supabase storage remain launch checks after sign-in is enabled. The full source image remains subject to the 20 MiB input limit, even if its eventual JPEG might be smaller. Multiple-image HEIF selections use the decoder's first image. Video transcoding is unchanged.
