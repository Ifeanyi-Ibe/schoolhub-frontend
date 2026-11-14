# Frontend Plan

Each phase: plan first, implement completely, pass the local gate, then stop at the CHECKPOINT for review.
Gaps that affect a phase are listed in `docs/BACKEND_GAPS.md` (IDs `B-xx`). Open decisions are in `docs/OPEN_ITEMS.md` (IDs `OI-xx`).

## F0 — Foundation
- Repo, tooling (TS strict, ESLint, Prettier), Vitest, Playwright, MSW, Serwist, next-intl, next/font.
- Pin exact versions after checking the registry (see OI-03).
- CI: typecheck, lint, tests, build, bundle-size check, Lighthouse CI, and the API drift check.
- `npm run api:gen` generates `src/lib/api/schema.d.ts` from `docs/openapi/v1.json` via openapi-typescript. CI fails when the generated file is stale.
- Design tokens: spacing, radius, elevation, typography, light and dark colour roles, brand accent from tenant CSS variables, contrast guard.
- Shared components in `src/components/ui` (Button, Input, Select, Dialog, Toast, Badge with text and colour, Table to Card, EmptyState, Skeleton, ErrorState, OfflineBanner, Sticky action bar, CommandPalette shell).
- `/dev/styleguide`, non-production only. Shows every token and every shared component in every state.
- BFF skeleton: `/api/bff/*` route handlers, cookie session, typed client wrapper, ProblemDetails adapter, CSRF and Origin checks, nonce CSP.
- PWA shell: manifest route, icons, splash, precached app shell, versioned service worker, offline fallback page, online and offline indicator.
- ADR 0001 (stack and BFF) and any further decisions.
- **CHECKPOINT:** design system and architecture review.

## F1 — Auth and app shell
- Login (email or phone + password), parent phone-OTP login, MFA (TOTP enroll, verify, recovery codes), forgot and reset password, accept invite, session list and revoke, change password, email and phone verification.
- Uniform auth error messages.
- Tenant branding and theming. Depends on B-01 and B-02. Until then: neutral theme pre-login, branding after sign-in if available.
- Permission-driven navigation. Error, offline and billing banners. `mfaEnrollmentRequired` routing. Session expiry and refresh-race handling.
- **CHECKPOINT:** security review of the BFF, cookies, CSP and refresh handling.

## F2 — Settings, academics, users and roles
- Settings: school profile, branding, policies. Depends on B-03.
- Academics: sessions, terms, class levels and arms, subjects, subject mapping, grading schemes and bands, assessment schemes and components, domain traits, calendar days and holiday import, rollover.
- Users: list, invite, resend invite, roles, disable, enable, unlock, reset MFA.
- Roles: list, create, edit permissions, delete. Permission catalog from `GET /permissions`.
- Audit log viewer and export (cursor-based, with URL-synced filters). Depends on B-10.

## F3 — Students, guardians, imports, promotions
- Student list (search, filters, page-based, URL-synced), profile, registration wizard (duplicate-candidate handling), edit with If-Match, soft delete.
- Guardians: add, edit, remove, portal invite.
- Documents: list, upload, delete. Photo upload is out of scope until OI-044 is resolved.
- Transfer, withdraw, graduate, reinstate. Notes (restricted; sensitive fields need permission).
- Bulk import: template, upload, job progress with polling, row-level validation report, error CSV, commit.
- Promotions: preview, then commit (idempotent).

## F4 — Staff and assignments
- Staff list and profile, create, edit (If-Match), deactivate and reactivate, invite user.
- Assignments per session (form teacher unique per arm), class-arm teachers, `GET /me/assignments` for teacher views.
- Leave: request, approve, reject. Staff documents and staff attendance are not in the contract (B-17).

## F5 — Attendance with offline queue
- Register: take attendance per class arm and date. Submit, reopen (audited).
- Offline: cache only the assigned class arm data in IndexedDB. Queue edits with `clientId` and `clientUpdatedAt`. Sync on reconnect (Background Sync where supported, foreground fallback for iOS).
- Per-row sync results: applied, ignored because a newer value exists, rejected with reason. The user resolves conflicts. Queued work is never dropped silently.
- Reports: class summary, absentees, term summary, XLSX export. Parent view of a ward's attendance.
- **CHECKPOINT:** offline and sync review.

## F6 — Fees and payments (staff and parent)
- Fee items and structures (draft, activate; lines editable only in draft), discounts, student discount grants and approval.
- Invoice generation (idempotent job with progress), invoice list and detail, void, adjustments, PDF.
- Payments: manual recording (idempotent, audited), online initialize and verify via the gateway authorization URL, receipts, reversal request and approval (maker-checker UI), unallocated queue and assignment.
- Ledger per student. Reports: collection, debtors aging, reconciliation.
- Parent: wards switcher, invoices, pay by card (authorization URL), bank-transfer details with copy buttons, receipts. Payments require online status.
- Not in the contract yet: statement, virtual accounts, payment plans, daily close (B-17).
- **CHECKPOINT:** money-flow review.

## F7 — Assessment and report cards (offline score entry)
- Score sheets: create, enter scores (offline-capable, with LWW sync like F5), submit, approve, reopen.
- Computation job with status. Class broadsheet (JSON and export). Student results.
- Domains and remarks (teacher and principal split).
- Report cards: generate (job), list, download through the BFF, publish (confirmed, audited).
- Amendments after publish (maker-checker).
- Parent: ward results and report cards. The fees-withheld state (`results.withheld_fees`) is not in the contract. Confirm its shape (B-04).

## F8 — Notifications, announcements, dashboards, audit, compliance, billing, platform admin, parent polish
- Templates with preview. Preferences. Announcements with audience preview and cost estimate, scheduling, cancel. Message log, retry, stats, SMS wallet.
- In-app inbox (page-based, see B-10).
- Dashboards: admin from `/dashboard/admin`. Bursar, teacher and parent dashboards are composed client-side from existing endpoints (B-16).
- Compliance: consents, data requests with approval, tenant export.
- Billing: subscription, invoices, pay (idempotent). Usage not in contract (B-17).
- Platform admin: tenants (create, list, detail, suspend, reactivate, cancel), metrics, SMS top-up. Plans, tenant edit, feature overrides, support sessions and platform audit are not in the contract (B-15).
- Parent portal polish: wards switcher, announcements, notification preferences, profile, sessions.

## F9 — Hardening
- Full accessibility audit (axe on every key screen, manual screen-reader pass).
- Performance tuning to budgets. PWA audit. Full e2e suite (critical journeys in the brief).
- Security headers review. Docs: README, `docs/RUNBOOK.md`, `docs/CONFIG.md` (every env var), deployment guide for the hosting target.

## Cross-cutting test plan
- Unit and component tests for logic and key components.
- MSW handlers typed from the generated OpenAPI types.
- Playwright e2e against the real backend (docker compose from the backend repo, demo seed). Journeys: staff login with MFA, register a student, generate invoices, record a payment, parent OTP login and pay, teacher attendance offline then sync, teacher score entry, publish results and parent views the report card, role-restricted navigation, tenant isolation across host switches, session expiry and refresh race.
- axe on every key screen. Lighthouse CI on mobile, throttled.
