# CLAUDE.md — SchoolHub Frontend

Production frontend (Next.js PWA) for a multi-tenant school management system used by private schools in Lagos, Nigeria. The .NET backend is the source of truth. Long specs live in `docs/`; this file holds the rules.

## Read first

- `docs/openapi/v1.json`: the only source for endpoints, fields and types.
- `docs/backend/CLAUDE.md`, `docs/backend/FEATURE_SPEC.md`: backend rules and feature status.
- `docs/API_OVERVIEW.md`: auth, tenancy, error, idempotency and concurrency conventions in one place.
- `docs/FRONTEND_PLAN.md` (phases), `docs/PROGRESS.md`, `docs/OPEN_ITEMS.md`, `docs/BACKEND_GAPS.md`, `docs/adr/`.

## Working agreement

- Plan each phase, then implement it completely (loading, empty, error, offline, validation, permission gating, a11y, tests). Stop at every CHECKPOINT for review.
- No stubs, no TODOs in work marked done. Never skip or weaken a test to get green.
- Two-tier local gate, reported with a short result summary:
  - `npm run gate:fast` (typecheck, lint, format check, unit/component tests, production build) runs before **every** commit. Every commit must pass it.
  - `npm run gate` (fast gate, then API drift check, production audit, bundle budgets, Playwright e2e) runs **once per phase** and **before any push**.
  - Check unpushed history with `git rebase --root -x "npm run gate:fast"`. Report any commit that fails.
- Conventional commits, one concern per commit. Commit only when asked. Never commit secrets.
- Verify package versions and framework APIs against the installed version or current docs. Do not work from memory.
- Never invent endpoints, fields or hand-written API types. Types come from the generated client. If the UI needs something the API lacks, log it in `docs/BACKEND_GAPS.md` and design around it.
- Record decisions as short ADRs in `docs/adr/NNNN-title.md`.

## Stack (pin exact versions at F0 install; deviate only with an ADR)

Next.js (App Router, latest stable) · React · TypeScript strict · Tailwind CSS + shadcn/ui (Radix) · TanStack Query (server state) · TanStack Table · React Hook Form + Zod · openapi-typescript + openapi-fetch (generated from `docs/openapi/v1.json`, drift-checked in CI) · Serwist (service worker) · Dexie (IndexedDB) · next-intl · date-fns + tz · Recharts (lazy-loaded only) · Vitest + Testing Library · MSW · Playwright + axe · Lighthouse CI.

## Architecture

- **BFF only.** Browsers call `/api/bff/*` route handlers. Those forward to the .NET API. Client code never calls the API directly.
- **Tokens** live in httpOnly, Secure, SameSite=Lax cookies. Client JS never reads them. Never store tokens or PII in localStorage, sessionStorage or IndexedDB.
- **Refresh:** refresh before expiry and on 401. Serialize to one in-flight refresh per session. On 409 `auth.refresh_in_flight`, wait briefly and re-read the session. On a genuine auth failure, clear cookies and redirect to login with a same-origin return path (validated).
- **Mutating BFF routes** verify `Origin` and require a custom header (CSRF defence). Set strict security headers and a nonce-based CSP. No `dangerouslySetInnerHTML` with untrusted content.
- **Tenancy:** the tenant comes from the request host `{slug}.<base domain>`. Local dev supports `{slug}.localhost` and an `X-Tenant` env fallback. Public branding is fetched server-side. Tenant colours are applied as CSS variables, after a WCAG AA contrast check.
- **Folders:** route groups `(auth)`, `(staff)`, `(parent)`, `(platform)`. Feature code in `src/features/<module>/{api,components,schemas,tests}`. Shared UI in `src/components/ui`. Server code in `src/server`. Page files hold no business logic.
- **Server Components by default.** Add `"use client"` only where interactivity needs it.
- **Signed-in data (default for staff screens).** A page reads its primary data on the server, in parallel, with `prefetchSignedIn` (`src/server/prefetch.ts`): the signed-in user (`GET /me`), the school (`GET /me/tenant`) and the screen's first list or record. The result is dehydrated and hydrated into the client cache with `HydrationBoundary`, so there is no client waterfall. The server never refreshes a session; with no usable token, the client loads as before. The query keys are the client's keys. Client permission checks remain UX only; the API decides.
- **Heavy forms load on demand.** A dialog or form that uses react-hook-form loads with `lazy` when it opens, not with the screen.
- **Environment-driven:** base domain, tenant host scheme and API URL come from env (`APP_BASE_DOMAIN`, `API_BASE_URL`, `BFF_API_KEY`). Never hardcode them. See `.env.example`.
- **Runtime:** Node, not edge. `output: 'standalone'`. Single instance initially (ADR 0003).
- **Typefaces:** Inter (body, UI, numerals) and Plus Jakarta Sans (headings), via `next/font` (ADR 0002).
- **Authorization in UI:** navigation and actions come from effective permissions in `GET /me`. Never check role names.

## API conventions (see `docs/API_OVERVIEW.md`)

- **Errors:** RFC 9457 ProblemDetails with a stable `code`. Map `code` to an i18n message, show field errors, and offer "copy error details" with the trace id.
- **Idempotency-Key:** one UUID per user action, reused on every retry. Send it only on operations the contract marks as idempotent.
- **Concurrency:** send `If-Match` with the `rowVersion` from the last read. On 409 `concurrency.conflict`, show a "changed by someone else" dialog with reload.
- **429:** honour `Retry-After` with a visible countdown. **402 `billing.suspended`:** persistent read-only banner with a billing link, and disable write actions. **`mfaEnrollmentRequired`:** route to MFA enrollment only.
- **Money** is integer kobo (`amountKobo`). Format with `Intl` as NGN, using tabular numerals. **Dates** display in Africa/Lagos.
- **Never optimistically update** money, results publishing, or anything audited. Show a pending state instead.
- **Downloads** (PDF, XLSX, CSV) are fetched on demand through the BFF. No PII in URLs.

## Security and privacy

- No PII in URLs, logs, analytics or error messages. Never log tokens, OTPs, passwords, or full phone and email values.
- Auth errors are uniform. Never reveal whether an account exists.
- Shared phones: wipe every offline store and cache on logout and on session expiry. Warn before logout when unsynced changes exist.
- Secrets come from env only. `.env.example` lists names, never values.

## UX and accessibility

- Mobile-first, designed at 360px, then scaled up. Parents and teachers get bottom navigation on mobile. Staff get a collapsible sidebar and Cmd/Ctrl-K on desktop.
- WCAG 2.2 AA. 44px touch targets. Visible focus. Labelled inputs. Errors and toasts are announced. Dialogs manage focus. Respect `prefers-reduced-motion`.
- Status is shown as text and colour, never colour alone.
- All user-facing strings come from the next-intl catalog. No hardcoded strings in components.
- Every screen has loading, empty, error and offline states.

## Performance budgets (enforced in CI)

- Parent-portal routes: initial JS ≤ 170 KB gzipped.
- Lighthouse mobile, throttled 4G, mid-range profile: performance ≥ 90, accessibility ≥ 95, PWA installable. LCP < 2.5s.
- Lazy-load charts, PDF viewers and heavy editors. Use `next/image` for photos. Fail CI on a budget regression.

## Definition of done (per feature)

Matches the API contract exactly · permission-gated · loading, empty, error and offline states · checked at 360px and desktop · keyboard and screen-reader accessible · strings in the catalog · tests added and green · budgets met · `docs/PROGRESS.md` and `docs/OPEN_ITEMS.md` updated.
