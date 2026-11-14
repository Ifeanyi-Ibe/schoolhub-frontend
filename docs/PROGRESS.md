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
