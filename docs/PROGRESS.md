# Progress

Status key: `done` · `waiting for checkpoint` · `not started` · `blocked (see B-xx / OI-xx)`

| Step                                                                               | Status                           | Notes                                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| STEP 0: ground yourself                                                            | done                             | Contract and backend specs read. Docs created. Reviewed.                 |
| F0: foundation                                                                     | **done, waiting for checkpoint** | Design system and architecture review. Details below.                    |
| F1: auth and app shell                                                             | not started                      | Waits for the backend's Tier 1 fixes and a regenerated contract (OI-12). |
| F2: settings, academics, users, roles                                              | not started                      | B-03 blocks settings.                                                    |
| F3: students, guardians, imports, promotions                                       | not started                      |                                                                          |
| F4: staff and assignments                                                          | not started                      |                                                                          |
| F5: attendance with offline queue                                                  | not started                      | Checkpoint: offline and sync review.                                     |
| F6: fees and payments                                                              | not started                      | Checkpoint: money-flow review. B-16 items out of scope.                  |
| F7: assessment and report cards                                                    | not started                      | B-17 blocks the withheld-results UX.                                     |
| F8: notifications, dashboards, audit, compliance, billing, platform, parent polish | not started                      | B-14, B-15 apply.                                                        |
| F9: hardening                                                                      | not started                      |                                                                          |

## F0 — what was built

**Repository.** Git on `main`. Docs first. The remaining commits are listed under "Commits" below.

**Toolchain.** Next.js 16.4.6 (App Router, Node runtime, `output: 'standalone'`), React 19.3.1, TypeScript 5.9.3 strict with `exactOptionalPropertyTypes`, Tailwind 4.3.5, ESLint 10 with the Next rules, Prettier 3.10.1, Vitest 5.1.0, Playwright 1.65.1 with axe, Lighthouse CI 0.16.1, openapi-typescript 7.13.0. Pins and reasons: ADR 0004.

**Contract client.** `npm run api:gen` produces `src/lib/api/schema.d.ts` (openapi-typescript) and `src/lib/api/operations.generated.ts` (267 operations: idempotency, `If-Match`, permission, access class, `x-*` extensions) from `docs/openapi/v1.json`. `npm run api:check` fails on any drift in the generated files or the contract hash. Contract patches: none needed in F0 (`src/lib/api/contract-patches/`).

**Errors.** One tolerant `ApiProblem` parser (`src/lib/api/problem.ts`) and one error boundary (`src/lib/api/unwrap.ts`). `code`, `traceId` and `errors` are optional, so the parser works with the snapshot and with the live spec.

**Writes.** Idempotency keys are sent only on the 23 operations that declare them, and retried only there. `If-Match` is sent only where declared. No operation declares it yet (B-05), so none is sent.

**Capabilities.** `src/lib/capabilities.ts` reads the manifest. Unbuilt features are hidden by checking the contract, not by path guessing.

**BFF.** Route handlers at `/api/bff/[...path]` (proxy), `/api/bff/download` (streamed files) and `/api/bff/health`. Pipeline: CSRF guard (custom header plus Origin) → `api/v1` path validation → tenant from the host → client IP from our own proxy only → session refresh (single flight, 8 s result cache, 409 contract) → the single API client → streamed relay with allow-listed headers and `no-store`. Details: ADR 0006 and ADR 0003.

**Session.** Tokens in httpOnly, SameSite=Lax, host-only cookies (`sh_at`, `sh_rt`). Refresh before expiry and once on 401. An invalid refresh clears cookies. A 409 `auth.refresh_in_flight` waits `Retry-After`, then retries with the newer refresh token the winning request stored. The result cache stays under the backend's 10 s grace window (test asserts this).

**Security headers.** Per-request CSP nonce in `src/proxy.ts`, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`, `upgrade-insecure-requests` in production, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS on HTTPS. `style-src-attr 'unsafe-inline'` is allowed so that runtime brand variables can apply; scripts stay nonce-only.

**Design system.** Inter and Plus Jakarta Sans, vendored Latin variable fonts through `next/font/local` (ADR 0002). Tokens in `src/app/globals.css`: neutral palette, one brand accent through `--brand` and `--on-brand`, light and dark themes, radius, shadows, focus ring, reduced motion. A test checks every text and non-text pair in both themes against WCAG AA (`src/lib/theme/tokens.test.ts`). Brand guard (`guardBrandColor`) darkens or lightens a school colour until its text colour meets 4.5:1.

**Shared components.** Button (44 px minimum), Input (labelled, `aria-describedby`, `aria-invalid`), StatusBadge (text and icon, never colour alone), Banner, Card, Skeleton and SkeletonList, EmptyState, ErrorState (retry and copy-error-details, with the trace ID but no request body), Dialog (focus returned to the opener), Toast (lazy region), ResponsiveTable (one DOM; cards below 768 px), StickyActionBar (safe-area aware), CommandPalette (combobox and listbox pattern, Ctrl/Cmd-K), Money (integer kobo, NGN, tabular figures), OnlineIndicator, ServiceWorkerRegistrar with UpdatePrompt.

**Formatting.** Naira from kobo with integer maths (`src/lib/format/money.ts`). Lagos dates without timezone shift for calendar dates (`src/lib/format/dates.ts`).

**Styleguide.** `/dev/styleguide` shows every token and every shared component in its states. It returns 404 in production.

**PWA shell.** Manifest route (platform defaults until B-01/B-02 land), placeholder icons (OI-11), Serwist service worker that precaches the build and `/offline.html`, never caches `/api/*`, and sends `skipWaiting` only on user acceptance (ADR 0005). Installability is checked directly in `e2e/pwa.spec.ts`.

**i18n.** next-intl, English catalog in `messages/en.json`. No hardcoded strings in shared components.

## Gate results (last full run, 2026-11-14)

| Step                                 | Result                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `typecheck` (app and service worker) | pass                                                                                                                                       |
| `lint` (zero warnings)               | pass                                                                                                                                       |
| `format:check`                       | pass                                                                                                                                       |
| `api:check`                          | pass (contract `2ad33a…`)                                                                                                                  |
| `audit:prod`                         | 0 vulnerabilities (full tree: 0)                                                                                                           |
| `test`                               | 160 tests, 20 files, pass                                                                                                                  |
| `build` (`next build --webpack`)     | pass                                                                                                                                       |
| `size`                               | `/` first-load JS **156,544 B gzipped**, budget 174,080 B (170 KB). Pass.                                                                  |
| `test:e2e`                           | 38 passed (19 per project: mobile 360 px and desktop)                                                                                      |
| Lighthouse CI (mobile, throttled)    | `/`: performance 100, accessibility 100, best practices 100, SEO 100, LCP 770 ms, CLS 0. Offline page: accessibility 100, performance 100. |

## Deviations and decisions (all recorded)

- TypeScript 5.9.3, not 7.x: `openapi-typescript` peer (ADR 0004).
- `next build --webpack`: the service worker needs the webpack plugin (ADR 0004).
- jsdom 29, not 31: Node 22.20.0 (ADR 0004).
- npm overrides for transitive security fixes (zod, postcss, glob, minimatch, basic-ftp), and zero audit findings (ADR 0004).
- Lighthouse 13 has no PWA category, so installability is asserted directly (ADR 0004, `e2e/pwa.spec.ts`).
- Lazy-loaded toast region, offline banner and update prompt, to keep the first load under budget (ADR 0005).
- Offline fallback is a static file with inline styles, so no nonce is needed (ADR 0005).
- Brand guard keeps the text colour fixed and adjusts the accent (not the text), which is the case that can actually fail (`contrast.ts`).

## Findings from the live backend (2026-11-14)

- Error bodies include `code` and `traceId` at runtime. The snapshot's schema lacked them. The live spec now declares them (B-04).
- Live spec: 225 paths. It adds `/api/v1/public/tenants/{slug}/branding` (typed) and `/logo`, which covers B-01. Snapshot not replaced (OI-12).
- Live spec documents the refresh 409 contract (B-07). Not reproduced end to end, because it needs a real session.

## Commits

See `git log`. One concern per commit, conventional messages, each commit's message ends with the attribution line. Note: the gate ran on the complete tree before the commits were cut. Intermediate commits are not each independently buildable, because files from later concerns are referenced earlier. Recorded in the final report.

## Waiting for you

1. Review of F0 (design system and architecture).
2. OI-12: import the live backend spec into `docs/openapi/v1.json` (regenerates the client and clears B-01, B-04, B-07 on our side).
3. OI-09 to OI-11, OI-13: region, minimum browser, icons, git identity.

## F1: auth and app shell (checkpoint evidence, 2026-11-14)

- Gate (last full run): typecheck, lint, format, API drift, audit (0), 236 unit tests, production build, budgets (/login 171,542 B; /home 162,504 B; limit 174,080 B), 88 e2e checks against the production build and the labelled test double.
- Lighthouse, mobile throttled: sign-in performance 100, accessibility 100, best practices 100, SEO 100, LCP 766 ms. Signed-in shell performance 98, accessibility 100, best practices 100, SEO 100, LCP 1,855 ms (the school name is rendered on the server).
- Real backend (development seed): see OPEN_ITEMS.md, "Verified end to end". Found and fixed two real bugs: the BFF's logout and refresh calls sent no JSON content type, so the API answered 415 and the session was not revoked. A regression test and a test double that enforces JSON now cover it.
- Not verified end to end: see OPEN_ITEMS.md.

## F1 fixes and F2 first slice (2026-11-14)

- **Gate:** `npm run gate` passes (fast gate, API drift, audit, budgets, 88 Chromium e2e). `gate:fast` passes with 279 unit and component tests. Two tiers now (ADR 0010, CLAUDE.md).
- **Budgets (per route group):** auth `/login` 171,815 B; parent `/home` 162,720 B, `/profile` 162,000 B, `/sessions` 164,167 B (cap 174,080 B each; target 153,600 B not met, see ADR 0010). Admin `/people` 199,241 B, `/roles` 202,096 B, `/roles/[id]` 174,662 B (cap 256,000 B). Teacher group reserved.
- **Test double:** every `/api` request is validated against `docs/openapi/v1.json`; a mismatch fails the run (ADR 0011).
- **Real backend:** 19 journeys pass (10 F1, 9 for the seed's gaps). See OPEN_ITEMS.md.
- **Defects fixed:** unsupported-browser page under the CSP; the signed-out notice never shown; the dialog's scroll-lock style blocked by CSP.
- **F2 first slice:** people (search, invite with idempotency) and roles (list, custom role creation, permission editor), gated by effective permissions. 8 browser journeys (desktop and 360px) and 12 unit tests pass.
- **F2 blocked:** settings (B-03, untyped responses), academic sessions (B-19, wrong shape in the contract), and concurrency (B-05, no If-Match declared). Academics, rollover, calendar and grading remain to be built.

## Steering round: fixes 1 to 9 and F2 partial (2026-11-14)

- **Identity:** every commit on `main` is authored and committed by Ifeanyi Ibe <phenomenonif@gmail.com>, set repo-local.
- **1 B-18 (interim):** the accept and reset pages read the token from the fragment, or temporarily from the query; the token is removed from the address bar at once; `Referrer-Policy: no-referrer` on those routes. Tests: `one-time-token.test.ts`, `reset-token.test.tsx`, `proxy-referrer.test.ts`. BACKEND_GAPS B-18 records the removal condition.
- **2 Server data:** `/people`, `/roles` and `/roles/[id]` read `/me`, the school and their list on the server in parallel and hydrate them (`src/server/prefetch.ts`). Lighthouse, mobile, simulated 4G, median of three runs: performance 93 (target 90, met); LCP 3,189 ms (target 2.5 s, **not met**). The remaining LCP is the framework's boot sequence and hydration under throttling.
- **3 CSP:** `style-src-attr 'unsafe-inline'` removed. Tenant colours are served from `/tenant-brand.css` (exact `#RRGGBB`, contrast-guarded; hostile strings tested). `next/image` replaced on the sign-in logo, which added an inline style. Nothing else needs the allowance; the policy is `style-src 'self' 'nonce-…'` (nonce only).
- **4 Engines:** Firefox offline: the server was still reachable (Playwright's offline mode does not stop service-worker fetches in Firefox); with the server stopped, Firefox shows the offline page. Firefox axe: content-process crash after typing into the sign-in form (not on a bare page). Both documented with evidence and skipped in Firefox only. WebKit: 25 of 26 critical journeys pass in the official Playwright image. The one failure is an uncaught page error from a router prefetch of `/login/otp` that WebKit blocks as a cross-origin access; open. CI job `e2e-engines` in `ci.yml`. A real bug found on the way: `upgrade-insecure-requests` was sent on plain-http production responses (fixed).
- **5 E2E hygiene:** the suspended-school journey no longer mutates the seeded school; it is skipped until the seed has its dedicated suspended school. Test data uses `e2e-` names. TESTING.md documents the disposable database; the nightly job recreates the backend's database from empty volumes.
- **6 Bundle ratchet:** the size check now loads each route in headless Chromium and counts every script it fetches (earlier figures undercounted by 10 to 25 KB). `scripts/budgets.ratchet.json` only goes down, with a 256 B build tolerance. Admin routes are 15 to 16 KB beyond the shell they share; the 40 KB limit is realistic. **Parent cap not met:** `/home` 174,338 B, `/sessions` 175,782 B, `/profile` 189,341 B (cap 174,080 B). ADR 0010 addendum has the numbers and the three options.
- **7 Roles and people rules:** see the verification table below.
- **8 F2:** class levels and arms built (list, add and edit levels; list and add arms; sections are the backend's five values, B-22). Subjects and mappings, grading and bands, assessment and components, calendar and holidays: **not built in this round**. All are typed by the contract; each needs its own screens, tests and real-backend checks. Settings (B-03) and academic sessions and rollover (B-19) remain blocked; no types were written for them.
- **9 Verification:** `npm run test:real`: 24 passed, 2 skipped (the suspended-school journey, awaiting the seed; the last-admin check, because the seed holds two SchoolAdmins). Chromium: 120 browser checks at 360px and desktop, zero CSP violations. Fast gate: 323 unit and component tests. Full gate: stops at the size step on the three parent routes above.

### Item 7: how each rule is implemented, and where it is tested

| Rule                       | Implementation                                                                                                                                                                                                               | Tests                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Escalation             | `canGrantRole` (invitation dialog: roles the actor cannot grant are disabled, with the reason); `canToggleRolePermission` (role editor: a permission the editor does not hold is disabled). A server refusal shows its code. | `roles-rules.test.tsx`: "disables a permission the editor does not hold, and says so"; "shows the backend's refusal code when the save is refused"; `InviteDialog.test.tsx`: "offers only the roles whose permissions the user holds". Real: `roles-journeys.spec.ts`: "the UI does not offer the built-in roles the actor cannot grant, and the API refuses them when sent" (API answered `403 role.escalation_denied`). |
| (b) Last SchoolAdmin       | Backend rule only; the screen has no role-removal control yet.                                                                                                                                                               | Real: "the backend refuses to remove the last SchoolAdmin's role…" **skipped**: the seed holds two SchoolAdmins. Unverified.                                                                                                                                                                                                                                                                                              |
| (c) SchoolAdmin immutable  | **Not implemented.** The contract has no immutability flag, and the backend accepted a no-op write to a built-in role (200).                                                                                                 | Real: "a change to a built-in role is sent to the API and the answer is recorded" (answer 200). Logged for the backend; see the open items.                                                                                                                                                                                                                                                                               |
| (d) Plan gating            | `hasCustomRoles` (entitlement `customRoles`); the New role button and the built-in role editor are locked without it.                                                                                                        | `roles-rules.test.tsx`: "does not let a built-in role change when custom roles are not in the plan"; "offers no new custom role when the plan does not include them". The real plan (dev-all) grants the entitlement; the locked path is covered by the component test only.                                                                                                                                              |
| (e) No role-name branching | Authorization reads effective permissions only.                                                                                                                                                                              | `no-role-names.test.ts`: "application code never compares against a role name" (scans `src`), and "the scan itself catches a comparison in either position".                                                                                                                                                                                                                                                              |

### Open items from this round

- **Parent cap** (ADR 0010 addendum): choose one of: drop TanStack Query from the signed-in shell (about 14 KB), defer the profile forms until opened (about 14 KB, a UX change), or cut the ICU message parser (about 12 KB, a catalogue change).
- **LCP on `/people`:** 3,189 ms median; the cause is boot and hydration under throttling. Candidate fixes need a measurement of hydration cost per component.
- **B-22:** the class section enum is not in the contract. **B-20 (to log):** no immutability flag for SchoolAdmin; a no-op write to a built-in role is accepted on the dev-all plan.
- **WebKit:** one uncaught page error from a `/login/otp` router prefetch.
- **Firefox:** the axe crash after typing (reported to the engine: pending); the offline journey is skipped in Firefox.
- **F2 not built:** subjects and mappings, grading and bands, assessment and components, calendar and holidays. Blocked: settings (B-03), academic sessions and rollover (B-19), concurrency (B-05: no If-Match is declared, so none is sent).

## Round: tidy and record (2026-11-16)

- **Role removal (item 5 of the previous round):** the people screen removes roles through `PUT /users/{id}/roles` (contract `SetUserRolesRequest`). Self-removal of staff access needs confirmation; the backend's refusal code is shown. Commit `ba7d81c`.
- **Chromium, 360px and desktop:** `e2e/staff.spec.ts` 20 of 20 (mobile-360 and desktop). The people rows are found by `td` text at 360px.
- **Real backend (`npm run test:real`, backend at 037402b, dev seed):** final full run 24 passed, 2 skipped, 1 failed. The failure was a 30 s setup timeout in the sign-out journey (environmental). Run alone it passes (1 of 1). The first full run had shown a stale API key on the running backend (restarted with the key from the env file); the other real-backend failures came from that and are gone. Skips: the last-SchoolAdmin journey (two SchoolAdmins in the seed) and the suspended-school journey (no dedicated seed school).
- **Firefox 159.0:** the committed axe sign-in journey crashed 5 of 5 runs; the name-locator variant 2 of 5. Still skipped; documented in `docs/TESTING.md`.
- **WebKit (Playwright image, v1.65.1):** 26 of 26 critical journeys pass (the earlier `/login/otp` prefetch error is resolved by the `prefetch={false}` change).
- **Items not done this round:** parent shell size (item 2), `/people` LCP (item 3), F2 subjects, grading, assessment and calendar (item 4), settings and academic sessions (item 5, spec not regenerated).
