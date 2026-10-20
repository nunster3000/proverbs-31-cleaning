# Social footer controls — October 20, 2026

Owner controls are under More → Website content → Footer social media. Supported platforms: Facebook, Instagram, TikTok, YouTube, LinkedIn, and X (including twitter.com URLs).

Each platform has an independent visibility checkbox and HTTPS page URL. Saving a visible link requires a recognized matching platform host and a nonempty page path. Blank/disabled links render no icon. URL validation runs in the form and database; customers cannot change settings. Links use the platform's Simple Icons SVG mark with accessible platform labels and a 44px touch target, open a new tab, and use noopener/noreferrer. No widgets or feeds load social tracking code.

All production settings default to disabled, with no invented profile URLs. Validation checks URL structure and platform hostname, not whether a profile exists or is publicly accessible; Gabrielle should open and verify her actual page before publishing its URL.

Verification: 79 standard tests passed (optional native concurrency test skipped). Unit checks cover unsafe schemes, root-only URLs, wrong hosts, lookalike domains, credentials, malformed visibility data, owner-only changes, icon SVG rendering, and hidden states. Hosted migration 010 applied successfully. In the isolated browser test, Facebook and Instagram showed their distinct icons; disabling Instagram left only Facebook. Both were disabled afterward. No test profile was saved to production.

Local evidence: `tmp/footer-social-icons-test.png` shows the isolated visual test. The preview URLs are fictional test identifiers, not approved business profiles.
