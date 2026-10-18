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

The public `nunster3000/proverbs-31-cleaning` GitHub repository is connected to the Vercel project. Pushes to `main` deploy production; other branches use Vercel previews. The configured repository root is `cinematic-preview/`. Vercel deployment protection currently requires Vercel sign-in to view the hosted demo.

The admin dashboard, live authentication, real availability, outbound email, and payment processing remain deferred.
