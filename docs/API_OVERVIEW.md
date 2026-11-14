# API Overview

Summary of `docs/openapi/v1.json` (v1.0, 223 paths, 267 operations, 242 schemas). The contract is the source of truth. Anything missing from it is in `docs/BACKEND_GAPS.md`.

## Authentication

- `POST /auth/login` (identifier = email or phone, password). Anonymous. Returns `LoginResponse`: `accessToken` (JWT, 15 min), `refreshToken` (opaque), `expiresIn`, `tokenType`, `mfaRequired`, `mfaToken`, `mfaEnrollmentRequired`, `enrollmentToken`.
- MFA: `POST /auth/mfa/verify` with `mfaToken`. Enrollment for accounts that must enrol first: `POST /auth/mfa/enrollment` (returns secret and otpAuthUri, once), then `/enrollment/confirm` (returns tokens and `recoveryCodes`).
- Parent sign-in by phone OTP: `POST /auth/otp/request` (always 202), `POST /auth/otp/verify`.
- Refresh: `POST /auth/refresh` with `{refreshToken}`. Rotates the token. Reuse of a rotated token revokes the family (backend rule).
- Logout: `POST /auth/logout` and `/auth/logout-all` (204).
- Platform staff: `POST /platform/auth/login`, with `/platform/auth/mfa/*` and `/platform/auth/refresh`. Two-factor required.
- Password: `/auth/password/forgot` (202), `/auth/password/reset`, and `POST /me/password` (204) when signed in.
- Invites: `POST /users/invite`, `POST /users/{id}/resend-invite`, `POST /auth/invites/accept`.
- Contact verification: `POST /me/contact/request` and `/me/contact/confirm`.
- Sessions: `GET /me/sessions`, `DELETE /me/sessions/{id}`.
- Security stamp: password change, disable, MFA reset and logout-all invalidate access tokens immediately. Role changes do not. They take effect on the next request.

## Tenancy

- A signed-in token carries the tenant (`tid` claim, authoritative).
- Unauthenticated tenant endpoints (login, forgot password, OTP, public admissions) resolve the tenant from the request host `{slug}.<base>` or a verified custom domain.
- `X-Tenant` is accepted only in Development (documented on 248 operations, but ignored elsewhere).
- Per backend CLAUDE.md §7.2 and §8.4 (not declared in the contract): unknown or cancelled tenant returns 404, tenant mismatch returns 403, and suspended tenant writes return 402 `billing.suspended`.
- Platform endpoints (`/platform/**`) need a platform user. Do not expose them to tenant users.
- Tenant status (`Trial`, `Active`, `PastDue`, `Suspended`, `Cancelled`) and flags come from `GET /me` (`tenantStatus`, `tenantPastDue`) and `GET /me/tenant`.

## Authorization

- `GET /me` returns `roles`, `permissions` and linked entities. The UI gates navigation and actions on `permissions`.
- Permission names appear in each operation's description ("**Requires permission:** `x.y`"). The contract has no machine-readable extension for them.
- Permission catalogue for admin UIs: `GET /permissions` (grouped by area).
- Data scope (teacher, parent, student) is enforced server-side. Out-of-scope reads return 404, not 403.
- Role names are display-only. Never branch on them.

## Errors

- RFC 9457 ProblemDetails. Status mapping (backend CLAUDE.md §10.1; the contract shows these status codes on operations): 400 validation, 401 unauthenticated, 402 `billing.suspended`, 403 forbidden, 404 not found or out of scope, 409 conflict (`concurrency.conflict`, `idempotency.in_progress`, `conflict.duplicate`), 422 business rule, 429 rate limit with `Retry-After`, 500 unexpected.
- Stable `code` strings (`module.reason`). The contract does not declare them yet (B-04).

## Idempotency

- Declared on 23 operations (`Idempotency-Key` header, 8 to 128 characters, client-generated UUID).
- Same key and same request: stored response replayed, with `Idempotency-Replayed: true`.
- Same key, different request: 422 `idempotency.key_reuse_mismatch`.
- Still in progress: 409 `idempotency.in_progress` with `Retry-After: 2`.
- Only 2xx and deterministic 4xx are stored. 5xx can be retried. Keys expire after 48 hours.

## Concurrency

- Updates should send `If-Match` with the `rowVersion` from the last read. Declared only in prose for students and staff (B-05).
- Conflict: 409 `concurrency.conflict`.

## Pagination

- Page-based lists: `page`, `pageSize` (max 100). Response: `items`, `page`, `pageSize`, `totalCount`, `totalPages`.
- Cursor-based lists: audit logs (`Cursor`, `PageSize` in PascalCase; response `items`, `nextCursor`). See B-10.

## Money, dates, phones

- Money: integer `amountKobo` (int64), currency NGN.
- Dates: `date` for calendar days (ISO `2034-09-04`). Instants: `date-time` in UTC with offset.
- Phones: E.164 (`+234…`). Local forms are accepted on input.
- Enums: strings.

## Downloads and files

- PDFs (invoice, receipt, report card), XLSX and CSV exports, and file content return binary responses through the API. The browser never sees the API URL (B-09).
- `POST /files/presign-upload`, `PUT /files/{id}/content`, `POST /files/{id}/complete` handle uploads.

## Endpoint groups (by first tag)

| Group             | Ops | Notes                                                                                                               |
| ----------------- | --: | ------------------------------------------------------------------------------------------------------------------- |
| Academics         |  41 | Sessions, terms, class levels and arms, subjects, grading and assessment schemes, domain traits, calendar, rollover |
| Fees              |  33 | Items, structures, discounts, invoices, payments, webhooks for Paystack, unallocated queue, ledger, reports         |
| Students          |  28 | Students, guardians, notes, documents, enrolment actions, promotions, import                                        |
| Assessment        |  24 | Score sheets, compute job, results, remarks and ratings, report cards, amendments                                   |
| Notifications     |  20 | Templates, preferences, announcements, messages, stats, SMS wallet, inbox                                           |
| Auth              |  17 | Login, MFA, OTP, refresh, logout, invites, password, platform sign-in                                               |
| Staff             |  16 | Staff, assignments, class-arm teachers, leave, invites                                                              |
| Compliance        |  12 | Consents, data requests, tenant export                                                                              |
| Me                |  11 | Profile, password, MFA self-service, contact, wards, assignments, report cards                                      |
| Attendance        |  10 | Register, submit and reopen, absentees, summaries, XLSX                                                             |
| Users             |   8 | Invites, roles, disable, enable, unlock, reset MFA                                                                  |
| Platform: tenants |   6 | Create, list, detail, suspend, reactivate, cancel                                                                   |
| Settings          |   6 | School profile, branding, policies (all untyped, B-03)                                                              |
| Files             |   6 | Presign, upload, complete, download URL, delete                                                                     |
| Roles             |   5 | List, create, permissions, delete, permissions catalogue                                                            |
| Webhooks          |   5 | Paystack, SMS, WhatsApp, email (server-to-server; not called by the UI)                                             |
| Audit             |   5 | Logs, detail, export and download                                                                                   |
| Admissions        |   4 | Public application, staff review, accept, reject                                                                    |
| Billing           |   3 | Subscription, invoices, pay                                                                                         |
| Platform          |   3 | Billing sweep, metrics, sign-in                                                                                     |
| Parents           |   3 | `/me/wards` and ward detail                                                                                         |
| Dashboard         |   1 | `/dashboard/admin`                                                                                                  |

## Endpoint names to use (contract, not spec)

See the naming table in `docs/BACKEND_GAPS.md`.
