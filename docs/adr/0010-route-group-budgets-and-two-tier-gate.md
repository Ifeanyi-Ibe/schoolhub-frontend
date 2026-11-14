# ADR 0010: Route-group bundle budgets and the two-tier gate

Status: accepted (F1 fixes, 2026-11-14).

## Context

CLAUDE.md sets one budget for parent-portal routes (170 KB gzipped). Staff and teacher screens will be heavier (tables, forms, schemas), so one number does not fit every route. The local gate ran in full before every commit, which made small commits slow.

## Decisions

1. **Budgets are per route group** (`scripts/budgets.json`). Each group has a hard cap (`budgetGzipBytes`) that fails the gate, and an optional target (`targetGzipBytes`) that is only reported.
   - `auth` and `parent`: cap 174,080 B (170 KiB). Target 153,600 B (150 KiB).
   - `teacher`: cap 204,800 B (200 KiB). `admin`: cap 256,000 B (250 KiB). Both reserved until routes exist; no target set.
   - A group's budget applies to every route in it, and each route is measured with the signed-in cookie where it needs one.
2. **Measured numbers, 2026-11-14:** `/login` 172,051 B; `/home` 162,913 B; `/profile` 162,280 B; `/sessions` 164,334 B. All under the cap; none under the 150 KiB target.
3. **The target is not reached, and the cap is not loosened.** Module attribution (`BUNDLE_REPORT=1`, `scripts/bundle-analysis-lib.mjs`) puts the floor at about 135 KB of framework for every route: Next's runtime with the bundled React DOM (about 78 KB), its App Router client (about 48 KB), and shared Next internals (about 7 KB). `next-intl` and its ICU message parser add about 14 KB, which every page needs. Removing react-hook-form (about 12 KB) would still leave a login page above 150 KB. Reaching the target would need a different framework, not a smaller app.
4. **Two changes that landed:** the profile's two form cards load on demand (react-hook-form stays out of the profile route's first load), and `date-fns` plus `@date-fns/tz` were replaced by `Intl` formatting for the two fixed date formats (about 7 KB gzipped off the signed-in routes).
5. **Messages per route group were not split.** Nested `NextIntlClientProvider`s per group added about 6 KB of JavaScript to `/login`, against about 1.3 KB of messages saved. The root provider keeps sending every client namespace.
6. **Two gates.** `npm run gate:fast` (typecheck, lint, format, unit tests, production build) runs before every commit. `npm run gate` (fast gate, API drift, production audit, budgets, Chromium e2e) runs once per phase and before any push. CLAUDE.md records the rule.

## Consequences

- Any new route must be placed in a group in `scripts/budgets.json`. Routes not listed are not measured.
- The `/login` margin to its cap is about 2 KB. Form or message changes there need a check with `npm run size`.
- Source maps are emitted only with `BUNDLE_REPORT=1`, so normal builds publish none.

## Addendum (2026-11-14): how bytes are counted, and what that changes

- **Correction.** The F1 and F2 figures counted only the scripts in each page's HTML. Chunks the browser fetches after the document (the page's own chunk, the `(app)` layout, and the query client) were not counted. The budget check now loads each route in headless Chromium and counts every script the page fetches (`scripts/check-bundle-size.mjs`). Earlier figures for signed-in routes were too low by 10 to 25 KB.
- **Measured with the corrected count:** `/login` 171,966 B (cap 174,080 B, met). `/home` 174,285 B, `/sessions` 175,729 B, `/profile` 189,288 B (cap 174,080 B, **not met**). Admin `/people` 187,850 B, `/roles` 186,530 B, `/roles/[id]` 187,022 B (cap 256,000 B, met).
- **Ratchet.** `scripts/budgets.ratchet.json` holds the last accepted value per route. A route above its value fails, and `--update-ratchet` lowers values only. The file was re-baselined once, deliberately (`--reset-ratchet`), because the measurement changed. Build variation is a few hundred bytes, so the baseline is taken from a normal build.
- **Route-specific JavaScript.** A group may set `maxRouteSpecificGzipBytes` against the assets every route in `shellRoutes` loads. Admin routes load 15 to 16 KB beyond the shell, against a proposed 40 KB limit, which is realistic.
- **Shared staff chunk** (the assets every admin route loads): 185,332 B. Composition: Next runtime and React DOM about 78 KB, Next's App Router client about 41 KB, TanStack Query about 14 KB, the API client and its unwrapping about 8 KB, Next internals about 7 KB, next-intl and its ICU parser about 12 KB, the shell about 2 KB, UI components about 3 KB.
- **Open decision.** The parent group is over its cap by 0.2 KB (`/home`), 1.6 KB (`/sessions`) and 15 KB (`/profile`). The caps are kept. Closing the gap needs one of: drop TanStack Query from the signed-in shell (about 14 KB), defer the profile forms until the user opens them (about 14 KB, a UX change), or cut the ICU message parser (about 12 KB, a catalogue change). Each needs an owner's decision; none is taken here.
