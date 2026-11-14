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
