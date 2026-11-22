# SaymoSaldo — launch-readiness audit

Date: 2026-11-22
Base: `main` at `128643453fa2795e9be41ec8894096df6ded25ef`

## Scope and safety

This audit branch is intentionally separate from `main`. No production code, deployed files, database records, secrets, or user financial data were changed. Do not merge this report as an application change.

## Confirmed repository facts

- Default branch is `main`; repository is public.
- The current main commit is `128643453fa2795e9be41ec8894096df6ded25ef`.
- GitHub Actions run `45048814816` completed with 11 successful jobs/steps as reported by the workflow run.
- `.github/workflows/quality.yml` checks JavaScript syntax for `app.js`, `auth.js`, and `learning.js`, and runs `tests/*.test.cjs`.
- The application is a static client-side app with `index.html`, `app.js`, `auth.js`, `learning.js`, `manifest.json`, and `sw.js`.
- The app persists financial collections in browser `localStorage`; `app.js` also contains a guarded multi-key save routine and a pending-sync marker.
- `auth.js` stores an access/refresh-token session in browser `localStorage`. This is not proof of a vulnerability by itself, but it increases the impact of any script-injection flaw and must be assessed together with all HTML rendering paths and CSP.
- `app.js` contains multiple dynamic `innerHTML` rendering paths. Some inspected paths escape user-controlled text, but a complete sink/source review is still required.
- `index.html` contains a large inline stylesheet and multiple appended refinement blocks. This is a maintainability and regression-risk concern, not by itself a functional defect.
- The repository includes Supabase Edge Function code, SQL migrations for backup access and username recovery, and client-side contract tests.

## First-pass findings / open risks

1. **Session storage / XSS impact:** tokens are stored in localStorage. Review every dynamic HTML sink, every user-controlled interpolation, imported backup field, chat message, profile/account field, and third-party script. Consider a stricter CSP and minimizing inline scripts/styles. Do not change auth storage architecture without a tested migration plan.
2. **Data synchronization:** verify user scoping, conflict handling, retry/backoff, offline edits, logout/login account switching, and recovery/restore behavior. Browser-local data must never leak between accounts or silently overwrite newer cloud data.
3. **Financial correctness:** add deterministic tests for month boundaries, negative/zero values, decimal rubles, duplicate submissions, refunds, debt payments, goal contributions, imported backups, and legacy currency normalization.
4. **Authentication UX:** inspect the current username-based login and recovery-code flow. The previously discussed email-confirmation flow is not confirmed as implemented. Verify rate limiting, enumeration resistance, recovery-code lifecycle, redirect allowlists, and session expiration.
5. **Production environment:** repository checks do not prove the deployed site's Supabase policies, Edge Function secrets, DNS, email settings, or live authentication flows are correct. These require read-only production configuration review and safe test accounts.
6. **Responsive UI:** automated source tests do not prove real iPhone Safari, Android, tablet, or desktop rendering. Use browser-based viewport checks and a short owner smoke test on the actual iPhone before launch.
7. **PWA release:** verify service-worker cache versioning, stale-cache upgrade behavior, offline fallback, manifest icons, installability, and that logout clears private cached state.

## Information architecture recommendation

Do not add new product sections before launch. Keep the existing burgundy design and ruble-only model. The home screen currently includes balance, status/insight, forecast, limits, goals, debts, and recent operations. The likely improvement is progressive disclosure: keep the most actionable 3–4 summary blocks on Home and leave detailed analysis in the existing sections. This should be validated against actual rendered mobile/desktop screenshots before changing layout.

## Next engineering sequence

- [ ] Read all source files and SQL migrations; map data flows and trust boundaries.
- [ ] Inspect Supabase Edge Function and RLS policies against the deployed project.
- [ ] Add regression tests before changing calculation, storage, or auth behavior.
- [ ] Run full local syntax and test suite; add edge-case financial tests.
- [ ] Prepare fixes on this audit branch, never directly on `main`.
- [ ] Validate built/deployed preview and check iPhone Safari before merge.
- [ ] Only then plan domain cutover and mobile app packaging.

## Owner actions (only when ready)

- [ ] Confirm a safe test account can be used for live sign-in testing; never share its password in chat.
- [ ] After technical review, purchase/confirm the desired domain and make DNS changes from the registrar account.
- [ ] Perform one short real-device smoke test before public launch.

## Release rule

A green GitHub Actions run is necessary but not sufficient. Do not describe the product as fully secure or launch-ready until the production Supabase configuration, live auth/data flows, backup/restore, and real-device UI have been checked.


## Additional confirmed authentication details

- New registrations are created through the `username-auth` Edge Function using a synthetic address under `accounts.saymosaldo.app` and `email_confirm: true`. This is a username + password + one-time recovery-code flow, not email-confirmation registration.
- The recovery code is generated with Web Crypto, only its SHA-256 hash is stored in the dedicated table, and the raw code is returned once to the client. The current reset path deliberately keeps the same high-entropy code after password change so a lost response does not lock the user out; review whether the intended recovery threat model requires rotation/revocation.
- The Edge Function enforces an Origin allowlist and calls a rate-limit RPC. Production behavior still depends on the deployed allowlist, deployed function version, configured secrets, and the actual database function/table state.
- The app's browser session includes both access and refresh tokens in localStorage. A migration to HttpOnly cookies is not a drop-in change for this static Pages architecture; do not attempt it without designing and testing a server-side session boundary.


## Additional review performed on 2026-11-22

- Reviewed the current release-validation script under `scripts/validate_release.py` (the workflow's actual target), the separate quality workflow, the auth client, the username-auth Edge Function, the service worker, and the backup/recovery SQL migrations.
- The repository has two distinct CI workflows. Before this audit branch was added to their push filters, neither workflow was configured to run for `audit/**`. Updated both workflow branch filters on this audit branch only so this review branch can receive the same automated checks. This does not change `main`.
- The release validator checks a restrictive script CSP with an exact SHA-256 hash for the one inline theme bootstrap, disallows external stylesheets, checks the approved first-party script list, checks the service worker's same-origin GET scope, verifies PWA assets, and checks that no privileged Supabase key appears in public client files.
- The backup RLS migration grants authenticated users SELECT and INSERT only, with policies binding rows to `auth.uid()`; restore/list RPCs are SECURITY INVOKER and explicitly restricted to authenticated users. The recovery-code table has RLS enabled and access revoked from public/anon/authenticated, with service_role access only. The email-to-user lookup function is SECURITY DEFINER but execution is revoked from public/anon/authenticated and granted only to service_role.
- Important limitation: source-level SQL review cannot prove these migrations have actually been applied to the live Supabase project or that deployed Edge Function code/secrets match the repository.
- The username registration flow is intentionally username + password + recovery code. It does not currently provide email-confirmation registration or email-based password reset. The existing synthetic account email is auto-confirmed by the Edge Function.
- Automated quality run triggered by the audit branch workflow-filter update: run `45062377398`, initially observed as queued. Final result still needs to be checked.
- No production app code, database, secrets, user records, or `main` branch were modified.
