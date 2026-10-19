# Proverbs 31 Cleaning

Cinematic, responsive customer booking demonstration for Proverbs 31 Cleaning Co.

The static website lives in `cinematic-preview/`. It includes the homepage, Services, interactive home selection, sample calendar, guided account setup, payment previews, confirmation, and customer dashboard.

All accounts, availability, emails, and payments are simulated. No admin dashboard is included. Demo details carry between screens using browser session storage.

## Run locally

```sh
python3 -m http.server 8765 --directory cinematic-preview
```

Open http://localhost:8765/.

## Vercel

Project: `proverbs-31-cleaning` under Khris’ projects. Framework: Other. Root directory: `cinematic-preview`. No build or install command is required. Output directory: `.`.

Production: https://proverbs-31-cleaning.vercel.app

Generated assets and their prompts are retained with the source. Screenshot proof files and local Vercel metadata are excluded.

## Automatic deployments

The public `nunster3000/proverbs-31-cleaning` GitHub repository is connected to the Vercel project. Pushes to `main` deploy production; other branches use Vercel previews. The configured repository root is `cinematic-preview/`.

The admin dashboard, live authentication, real availability, outbound email, and payment processing remain deferred.

## Service rules updated after owner clarification

The shared catalog in `cinematic-preview/assets/service-catalog.js` defines Standard Cleaning, Deep Cleaning, Apartment Cleaning (Move-In / Move-Out), and Airbnb Turnover. King/Queen bedroom-and-bathroom scopes are Airbnb guest-suite options, not standalone service categories. Whole-home prices remain size-based starting prices. Deep Cleaning adds $100; baseboards are included, and selecting Kitchen as a deep-cleaning focus includes refrigerator and stove/oven care without double charging.

Optional add-ons: laundry $20/load (folding and hanging), refrigerator $75, stove/oven $85, baseboards $45. The demo calculates the existing 50% deposit from the starting service amount before optional add-ons, credits it toward the estimated total, and leaves final pricing pending walkthrough review. This deposit calculation should be confirmed when connecting real payments.

Customer portal Virtual Walkthrough accepts sample photos/videos, room labels and notes. Local previews can be saved to this device's IndexedDB, restored, removed, or cleared. Nothing is uploaded. Limits are prototype choices (6 files, 20 MB each, 80 MB total), not approved production policies. Restarting booking clears session details, not saved walkthrough media. The demo privacy page explains deletion.

Before production: implement authenticated private uploads, server-side file validation, retention/deletion rules, owner review, final-quote approval and actual invoicing. Keep payment processing, email, live authentication/availability, and the admin dashboard deferred until configured. The supplied logo is used outside the cinematic hero.

Pricing verification: `node --test tests/service-pricing.test.cjs`.

Booking Review and the customer portal share a service summary showing scope, included tasks, selected paid add-ons, starting service price, estimated total, and starting-price deposit. New demo bookings save their included-care snapshot with the existing session record. Portal overview, booking details, walkthrough, and payment breakdown keep final pricing pending virtual walkthrough review; no final balance is issued automatically.
