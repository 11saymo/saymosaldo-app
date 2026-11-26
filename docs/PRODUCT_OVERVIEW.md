# MUNORA — product and technical overview

> This document describes the current codebase and declared product scope. It is not a warranty, security certification, legal opinion, financial forecast, or claim of commercial traction. Verify all details during technical and legal due diligence.

## Product

MUNORA is a Russian-language personal-finance web application for recording income and expenses, planning a budget, tracking savings goals, recurring payments, and debts.

Current documented capabilities:
- Income and expense records with categories and dates.
- Monthly category budgets and spending limits.
- Savings goals, including an optional interest-based projection.
- Recurring payments and debt/obligation tracking.
- Local export and restore of user data.
- Account-based cloud synchronization across devices.
- User-initiated account and cloud-data deletion with reauthentication and explicit confirmation.
- Installable Progressive Web App (PWA) and a browser offline/cache layer.

MUNORA is a personal bookkeeping and planning tool. It is not a bank, payment processor, broker, lender, or financial-advice service. It does not connect to bank accounts or initiate payments.

## Technology

| Layer | Current implementation |
|---|---|
| Client | HTML, CSS, vanilla JavaScript |
| Hosting | GitHub Pages, custom domain munora.ru |
| Authentication | Supabase Auth, Google OAuth using PKCE |
| Database | Supabase Postgres |
| Data isolation | PostgreSQL Row Level Security (RLS) |
| Server-side functions | Supabase Edge Functions |
| Offline support | Service Worker and browser local storage |
| Automated checks | GitHub Actions, Node.js tests, release validation, CodeQL |

The public client is designed to use a Supabase publishable key only. Privileged service-role credentials must remain in server-side secrets and must never be shipped to the browser.

## Data model and user experience

The app stores finance records such as transactions, goals, budgets, recurring items, debts, and assistant conversation history. Records are associated with an authenticated account for cloud synchronization. The browser also keeps a local working copy.

The current authentication experience is Google sign-in. The current product does not use a separate MUNORA password or a separate MUNORA password-reset flow.

Local browser storage and session tokens are not protected by a separate MUNORA encryption password. Users should protect their devices, avoid shared/public devices, and never enter bank passwords, PINs, CVVs, or one-time banking codes.

## Infrastructure and deployment

- Public web client: GitHub Pages at https://munora.ru/.
- Database and authentication: Supabase project currently hosted in the eu-west-1 (Ireland) region.
- Source repository: https://github.com/11saymo/saymosaldo-app.

Infrastructure providers, data locations, backup configuration, operational limits, and applicable data-protection obligations must be reviewed for the intended buyer, users, and target markets before a commercial launch or transfer.

## Quality and security work

The repository includes automated checks for JavaScript syntax, backup import validation, local-storage write rollback, authentication contracts, selected feature calculations, release metadata, and static security analysis.

A passing automated workflow is evidence that the configured checks passed for a particular commit. It is not a penetration test, independent security audit, legal-compliance certification, or proof that every runtime path is defect-free.

The current documented architecture includes:
- Google OAuth with PKCE.
- Authenticated cloud requests.
- RLS-based user-data isolation.
- No privileged Supabase key in the public client.
- Explicit confirmation and recent reauthentication for account deletion.
- Cache handling that avoids persisting OAuth callback URLs.

## Commercial and due-diligence items to verify

The following information is intentionally not invented and must be collected before representing the product to a buyer:
- Active users, retention, usage frequency, and customer feedback.
- Revenue, costs, conversion, and any signed commercial agreements.
- Ownership and transferability of the domain, brand, source code, design assets, and third-party dependencies.
- Complete inventory of hosting, Supabase, Google OAuth, domain registrar, and other accounts/contracts.
- Database backup/export and tested restoration evidence.
- Independent security review and runtime testing on supported browsers/devices.
- Privacy, data-localization, user-notice, and personal-data transfer requirements for each target market.
- A documented process for handling existing users and their data in any acquisition.

## Acquisition handover principles

A transaction should define the exact assets and rights being transferred, the effective handover date, support obligations, liabilities, and treatment of existing user data. User records are not ordinary sale inventory: any migration or transfer must have a valid legal basis, appropriate user information, access controls, and a secure transfer plan.

Never transfer passwords, OAuth tokens, service-role keys, private credentials, or raw user financial records as part of an informal demonstration. Use a sanitized demo environment and rotate/reissue credentials as part of a formal handover.

## Repository

Source code and automated checks: https://github.com/11saymo/saymosaldo-app
