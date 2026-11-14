# Backend Gaps

Findings from reading `docs/openapi/v1.json` against `docs/backend/FEATURE_SPEC.md` and `docs/backend/CLAUDE.md`.

**Backend fix status (owner, 2026-11-14):** the backend is fixing these in parallel. Tier 1: branding (B-01, B-02), ProblemDetails schema (B-04), refresh 409 docs (B-07), trusted BFF tenant passing and client IP forwarding (B-08), typed responses (B-03, B-11), If-Match (B-05), camelCase params (B-10), machine-readable permissions, and spec export. The frontend regenerates from the new spec when it lands. Each entry's status below reflects the STEP 0 read; it is updated as fixes land. Until then, the frontend uses only the design-arounds listed here and the temporary contract patches in `src/lib/api/contract-patches/`.

### Status after Tier 1 (2026-11-14)

The interim contract is now the backend's live spec (backend repo `School-Management` HEAD `66a8158`, "frontend contract tier 1"). Snapshot `docs/openapi/v1.json`, sha256 `1fdc3e…`, 269 operations. The Development-only `X-Tenant` parameter is stripped from the generated types only. The backend's committed Staging export will replace this file when Batch A lands. The drift check will show that diff.

| Gap                                             | Status     | Evidence                                                                                                                                                                                        |
| ----------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 public branding                            | **Landed** | `GET /api/v1/public/tenants/{slug}/branding` (typed `SchoolBrandingView`), `/logo`, ETag. Anonymous. ADR 0028.                                                                                  |
| B-02 branding for signed-in users               | **Landed** | `/me/tenant` carries the same `branding` object (backend change).                                                                                                                               |
| B-03 typed settings responses                   | Open       | `settings/*` still `type: object` in the interim contract.                                                                                                                                      |
| B-04 ProblemDetails `code`, `traceId`, `errors` | **Landed** | Required `code` and `traceId`; `errors` documented. ADR 0027.                                                                                                                                   |
| B-05 `If-Match`                                 | Open       | 0 operations declare it.                                                                                                                                                                        |
| B-06 idempotency coverage                       | Open       | 23 declared; the five spec-only operations are still undeclared.                                                                                                                                |
| B-07 refresh 409 documented                     | **Landed** | `auth.refresh_in_flight`: wait `Retry-After`, nothing revoked. ADR 0008 (backend).                                                                                                              |
| B-08 trusted BFF headers                        | **Landed** | `X-Bff-Key` (≥32 chars, two keys for rotation), `X-Tenant` in every environment, first `X-Forwarded-For` entry, `X-Client-User-Agent`. Invalid key → `401 bff.key_invalid`. ADR 0026 (backend). |
| B-09 download URLs                              | Open       | `download-url` returns `{url, method}` only. The BFF streams downloads, so no signed URL is needed.                                                                                             |
| B-10 camelCase query params                     | Open       | Audit params still PascalCase.                                                                                                                                                                  |
| B-11 typed 2xx responses                        | Open       | 48 operations still untyped.                                                                                                                                                                    |
| machine-readable permissions (`x-*`)            | Open       | No `x-*` extensions. The manifest reads prose.                                                                                                                                                  |
| B-13 to B-16 (unbuilt features)                 | Unchanged  | Not in the contract.                                                                                                                                                                            |

Documented responses now also cover the login 429 (`auth.account_locked` or rate limit).

Status key: **Blocking** = the feature cannot be built as specified. **Design-around** = we build with a workaround and need confirmation. **Info** = naming or shape drift; we follow the contract.

## Gaps the UI needs

### B-01 — Public tenant branding (anonymous)

- **Need:** name, logo URL and colours before login, for the login page and the per-tenant web manifest.
- **Spec:** FEATURE_SPEC §1.2 `GET /public/tenants/{slug}/branding`.
- **Contract:** not present. Not built per the spec either (§1.2 unchecked).
- **Impact:** no tenant theme or manifest before sign-in.
- **Design-around:** neutral default theme and a generic manifest before login. Tenant branding after sign-in (B-02).
- **Status:** Blocking for full tenant theming at login (F1).

### B-02 — Branding readable by any signed-in user

- **Need:** school name, logo and colours in the app shell for every role (teachers and parents too).
- **Contract:** `GET /settings/branding` requires `settings.manage` (SchoolAdmin only). `GET /me/tenant` returns `TenantSummaryView` with plan, entitlements, limits, usage and status flags, but no name, logo or colours.
- **Design-around:** none good. Teachers and parents would see a neutral shell.
- **Status:** Blocking for app-shell branding (F1). Ask: add name, logo URL and colours to `/me/tenant`, or let any signed-in user read branding.

### B-03 — Settings responses are untyped

- **Contract:** `GET`/`PUT` `/settings/school-profile`, `/settings/branding` and `/settings/policies` respond with `{"type":"object"}`. No fields are declared. The branding colour and logo field names are not in the contract at all.
- **Impact:** F2 settings screens cannot be typed from the contract. Writing our own types would break the "no hand-written API types" rule.
- **Design-around:** none without a hand-written type. Hold the settings screens until the contract declares fields.
- **Status:** Blocking for F2 settings and for B-02's branding fields.

### B-04 — The error body in the contract omits `code`, `traceId` and `errors`

- **Need:** stable `code` for i18n mapping, field `errors` for inline validation, `traceId` for "copy error details".
- **Spec:** CLAUDE.md §10.1 defines `{type, title, status, detail, instance, traceId, code, errors?}`.
- **Contract:** `ProblemDetails` has only `type`, `title`, `status`, `detail`, `instance`, with `additionalProperties: false`. No operation documents a `code` or `errors` field. Error codes such as `students.possible_duplicate`, `plan.limit_reached`, `tenancy.mismatch`, `results.withheld_fees` and `notifications.not_optional` are not in the contract.
- **Design-around:** one error adapter reads the raw JSON body. It treats `code`, `traceId` and `errors` as optional and falls back to a generic message.
- **Status:** Blocking for the error-message catalogue (F0) and the field-error UX (all forms). Confirm the wire format with the backend, then update the contract.

### B-05 — Concurrency token (`If-Match`) is documented in prose only

- **Contract:** no operation declares an `If-Match` header parameter. The description of `PATCH /students/{id}` and the staff `PUT` says "If-Match carries the rowVersion from the last read". Only `StudentView` and the staff types carry `rowVersion`.
- **Impact:** the typed client cannot send `If-Match` for any operation without a hand-written header. We do not know which other resources have a row version.
- **Design-around:** send `If-Match` from the `rowVersion` of the last read, only where the response carries one. Add the header manually in the BFF call wrapper, with a single helper.
- **Status:** Design-around. Ask the backend for the full list of resources with `rowVersion` and the header declaration.

### B-06 — Idempotency coverage differs between spec and contract

- **Contract marks 23 operations** with an `Idempotency-Key` parameter.
- **Spec marks these as `[I]` but the contract does not:** `POST /invoices/{id}/adjustments`, `POST /payments/unallocated/{id}/assign`, `POST /report-cards/publish`, `POST /assessment/compute`, `POST /guardians/{id}/portal-invite`. Also `POST /students/{id}/virtual-account` (not built) and `POST /public/signup` (not in contract).
- **Design-around:** send `Idempotency-Key` only on the 23 declared operations. For the undeclared ones, never auto-retry. After a network failure, show "check before retrying" and re-read the current state first.
- **Status:** Design-around. Ask: confirm whether the backend honours the header on the five listed operations.

### B-07 — `409 auth.refresh_in_flight` is not documented anywhere

- **Need:** the brief says to wait and re-read the session on this 409.
- **Contract and backend docs:** neither defines it. The refresh rules say refresh tokens rotate on every use, and reuse of a rotated token revokes the family.
- **Design-around:** serialize refresh inside the BFF process, so one browser session has one in-flight refresh. If a 409 with this code appears anyway, wait briefly and re-read the session. Treat any other refresh failure as a real logout.
- **Caveat:** a multi-instance BFF needs a shared lock (for example Redis). Not decided yet (OI-08).
- **Status:** Design-around. Ask: does the backend return this 409, and what is the retry guidance?

### B-08 — No header contract for the tenant host behind a proxy

- **Need:** the BFF runs on its own host, but the API resolves unauthenticated tenant endpoints (login, forgot password, OTP) from the request host subdomain `{slug}.<base>`.
- **Contract:** the only documented tenant input is `X-Tenant`. It is "Development only ... Ignored and not offered outside Development". The contract does not say how the API learns the school host behind a proxy (no `X-Forwarded-Host`, no `Forwarded`).
- **Impact:** login, OTP and forgot-password may resolve the wrong tenant, or none, in production. This is a tenant-isolation risk.
- **Design-around:** none safe. The BFF must not invent a tenant. It forwards the tenant it derived from the host through a named header that the backend trusts from the BFF only.
- **Status:** Blocking for production login (F1). Ask: which header and which trusted-proxy setup the backend expects.

### B-09 — File downloads are not signed URLs the browser can use

- **Spec:** CLAUDE.md §10 and the brief expect short-lived signed URLs. FEATURE_SPEC §10 says files are "served through the API session, not signed links (OI-045)".
- **Contract:** `GET /files/{id}/download-url` returns `{url, method}`, with no expiry and no auth details. Invoice PDF, receipt, report-card and export downloads are direct API responses that need the bearer token.
- **Design-around:** the BFF streams every download with the caller's token. The client never sees an API URL. This matches the backend note.
- **Status:** Design-around. Confirm that `url` values always need the bearer token.

### B-10 — Pagination and query-parameter naming are inconsistent

- **Audit log** (`GET /audit-logs`) uses PascalCase query names: `Cursor`, `PageSize`, `ActorUserId`, `EntityType`, `EntityId`, `Outcome`, `CorrelationId`, `From`, `To`, `Action`. The rest of the API is camelCase. Audit responses use `nextCursor`.
- **Notifications inbox** (`GET /me/notifications`) is page-based (`page`, `pageSize`, `unreadOnly`), but the spec asks for cursor pagination on notifications.
- **Design-around:** use the contract names exactly. Use page-based pagination for the inbox.
- **Status:** Info, with a question: is the PascalCase on audit a documentation error?

### B-11 — 47 operations have no typed 2xx response

- **Examples:** `PATCH /me` (profile update returns nothing typed), `POST /me/mfa/confirm`, `POST /me/mfa/disable`, `POST /me/contact/request|confirm`, `POST /auth/invites/accept`, `POST /auth/password/reset`, `DELETE /class-levels/{id}`, `DELETE /arms/{id}`, `DELETE /subjects/{id}`, `DELETE /grading-schemes/{id}`, `DELETE /domain-traits/{id}`.
- **Design-around:** treat the status code as the result. For `PATCH /me`, we cannot show the returned profile, so we re-read `GET /me` after the save.
- **Status:** Design-around. Ask for typed success bodies where a value is expected back.

### B-12 — Binary responses have no declared content type

- PDF, XLSX, CSV and file-content responses are documented with `description: OK` and no content type. The contract only has `application/problem+json` for errors.
- **Design-around:** the BFF passes through the upstream `Content-Type`, `Content-Disposition` and length. Client code uses blobs.
- **Status:** Info.

### B-13 — MFA recovery-code regeneration is missing

- **Spec:** FEATURE_SPEC §2 lists `POST /me/mfa/recovery-codes/regenerate`.
- **Contract:** absent. Recovery codes come back only from `EnrollmentDoneResponse` at enrollment confirm.
- **Design-around:** no regenerate action in the UI. The recovery codes shown at enrollment are the only copy, and the UI must say so.
- **Status:** Design-around. Confirm whether regeneration is planned.

### B-14 — Platform admin screens lack contract operations

- **Missing:** `PATCH /platform/tenants/{id}`, `PUT /platform/tenants/{id}/plan`, `PUT /platform/tenants/{id}/features/{key}`, `GET/POST/PUT /platform/plans`, `GET /platform/audit`, `POST /platform/tenants/{id}/support-sessions`.
- **Design-around:** build what exists (tenant list, create, detail, suspend, reactivate, cancel; metrics; SMS top-up). Leave the rest out of the UI.
- **Status:** Design-around for F8. The spec marks several of these unchecked as well.

### B-15 — Dashboards other than admin are missing

- **Contract:** only `GET /dashboard/admin`. `/dashboard/bursar`, `/dashboard/teacher`, `/dashboard/parent` are not in the contract (FEATURE_SPEC §11 unchecked).
- **Design-around:** compose on the client from existing endpoints. Teacher from `/me/assignments` and score sheets. Bursar from `/invoices` and `/fees/reports/*`. Parent from `/me/wards` and each ward's invoices and attendance. Accept more requests per screen; cache with TanStack Query.
- **Status:** Design-around.

### B-16 — Features the spec does not build (not in the contract)

- Student photo upload (OI-044) · student summary (OI-064) · student and ward statements (OI-085) · virtual accounts (OI-085) · payment plans · payments daily close (OI-092) · fee structure clone (OI-095) · results history (OI-104) · billing usage (OI-122) · public signup · public admissions branding · standard exports (student list, class list, attendance, fee report, broadsheet) · staff documents (OI-067) · staff attendance · web push.
- **Design-around:** hide these screens and list them in the roadmap. No placeholders in done work.
- **Status:** Out of scope for v1 of the frontend unless the backend delivers them.

### B-17 — Withheld results and fee gating states

- **Spec:** `results.withheld_fees` (parent portal, FEATURE_SPEC §7).
- **Contract:** the code is not documented. The shape of the withheld response on `GET /me/wards/{id}/results` and `GET /me/wards/{id}/report-cards` is not documented.
- **Design-around:** treat any 2xx response without a visible report card as "not available yet". Show the withheld message only after the code is documented.
- **Status:** Blocking for the withheld-results UX (F7). Ask for the response shape.

## Spec-to-contract naming differences (follow the contract)

| Spec name                                              | Contract                                               |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `POST /auth/accept-invite`                             | `POST /auth/invites/accept`                            |
| `POST /auth/forgot-password`                           | `POST /auth/password/forgot`                           |
| `POST /auth/reset-password`                            | `POST /auth/password/reset`                            |
| `POST /auth/change-password`                           | `POST /me/password`                                    |
| `POST /auth/verify-email`, `verify-phone`              | `POST /me/contact/request`, `POST /me/contact/confirm` |
| `GET /fee-structures`, `/fee-structures/{id}/activate` | `/fees/structures`, `/fees/structures/{id}/activate`   |
| `GET /payments/verify/{reference}`                     | `GET /payments/verify?reference=`                      |
| `GET /attendance/reports/class-summary`                | `GET /attendance/class-arms/{id}/class-summary`        |
| `GET /attendance/reports/term-summary`                 | `GET /attendance/class-arms/{id}/term-summary`         |
| `GET /assessment/results/students/{id}/history`        | not in contract                                        |
| `PATCH /users/{id}`                                    | not in contract                                        |
| `POST /me/mfa/recovery-codes/regenerate`               | not in contract (B-13)                                 |

## Contract hygiene (for the backend team)

- `ProblemDetails` is missing `code`, `traceId`, `errors` (B-04).
- `settings/*` responses are untyped (B-03).
- Operations with no 2xx schema (B-11).
- Operations with `Idempotency-Key` do not match the spec's `[I]` list (B-06).
- Only `localhost:5152` appears under `servers`. The production base URL is an env setting (OI-02).
