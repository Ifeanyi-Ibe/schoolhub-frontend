# Backend Gaps

Findings from reading `docs/openapi/v1.json` against `docs/backend/FEATURE_SPEC.md` and `docs/backend/CLAUDE.md`.

**Backend fix status (owner, 2026-11-14):** the backend is fixing these in parallel. Tier 1: branding (B-01, B-02), ProblemDetails schema (B-04), refresh 409 docs (B-07), trusted BFF tenant passing and client IP forwarding (B-08), typed responses (B-03, B-11), If-Match (B-05), camelCase params (B-10), machine-readable permissions, and spec export. The frontend regenerates from the new spec when it lands. Each entry's status below reflects the STEP 0 read; it is updated as fixes land. Until then, the frontend uses only the design-arounds listed here and the temporary contract patches in `src/lib/api/contract-patches/`.

### Status after the dev seed and the F1 probes (2026-11-14)

Interim contract: the backend's live spec (repo `School-Management`, HEAD `56f7c43` includes the dev seed). Checked against `docs/openapi/v1.json` (sha256 `1fdc3e…`, 269 operations).

| Gap                                             | Status                  | Evidence                                                                                                                             |
| ----------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| B-01 public branding                            | **Landed**              | Typed `SchoolBrandingView`, `/logo`. Verified: `demo` branding 200; the sign-in page shows "Demo Academy" from it.                   |
| B-02 branding for signed-in users               | **Landed**              | `TenantSummaryView.branding` in the interim contract. The shell reads it.                                                            |
| B-03 typed settings responses                   | Open                    | Settings responses are still `{"type":"object"}` (checked).                                                                          |
| B-04 ProblemDetails `code`, `traceId`, `errors` | **Landed**              | Verified at runtime: `code` and `traceId` on every error seen (login, refresh, tenancy, key).                                        |
| B-05 `If-Match`                                 | Open                    | 0 operations declare it (checked).                                                                                                   |
| B-06 idempotency coverage                       | Open                    | 23 declared (checked).                                                                                                               |
| B-07 refresh 409 documented and real            | **Landed and verified** | Two concurrent refreshes with one token: 200, then 409 `auth.refresh_in_flight` with `Retry-After: 1`. The BFF follows the contract. |
| B-08 trusted BFF headers                        | **Landed and verified** | With no key configured, a wrong key gets `401 bff.key_invalid`. With the configured key, trusted calls are accepted.                 |
| B-09 download URLs                              | Open                    | `download-url` returns `{url, method}` only. The BFF streams downloads.                                                              |
| B-10 camelCase query params                     | Open                    | Audit params still PascalCase (checked).                                                                                             |
| B-11 typed 2xx responses                        | Open                    | Untyped 2xx operations remain (checked in the interim contract).                                                                     |
| machine-readable permissions (`x-*`)            | Open                    | 0 `x-*` extensions (checked).                                                                                                        |
| Login 429                                       | **Verified**            | Real OTP request: `429` with `Retry-After: 600`; the page shows the countdown.                                                       |
| Uniform sign-in errors                          | **Verified**            | Wrong password and unknown account: identical `auth.invalid_credentials` bodies (differ only in trace ID).                           |
| Logout revokes the session                      | **Verified**            | After `POST /auth/logout`, the refresh token is refused with `401 auth.token_invalid`.                                               |
| B-13 to B-16 (unbuilt features)                 | Unchanged               | Not in the contract.                                                                                                                 |

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
- **Status:** Resolved for the reads: the swapped spec types the three settings views. The PUT bodies are still untyped (B-28).

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

### B-18 — Invitation and reset links carry the token in the query string

- **Observed:** the Development message for an invitation reads `Set your password within 72 hours: https://app.schoolhub.example/accept-invite?school=demo&token=…`. The reset message uses the same `token=` query form.
- **Frontend rule:** the one-time token is read from the URL fragment, which the browser never sends to the server. The page accepts the fragment as the preferred form.
- **Interim (2026-11-14, tolerant):** the page also accepts the query form. It reads the token, removes it from the address bar at once (`history.replaceState`), and sends it only to the accept or reset call. The invitation and reset routes send `Referrer-Policy: no-referrer`. The query string of those routes is not logged by the app. The Next.js development server prints request paths, query strings included, in its own terminal output; production does not.
- **Verification:** unit tests cover both forms, the stripping and the referrer header (`one-time-token.test.ts`, `reset-token.test.tsx`, `proxy-referrer.test.ts`). The real-backend journey opens the emailed link and checks the page accepts it (`e2e-real/admin-journeys.spec.ts`).
- **Removal:** delete the query form (and the test that uses it) when the backend emits fragment links, for example `accept-invite#token=…`.
- **Status:** Tolerant interim in place. Open until the backend emits fragment links.

### B-19 — Duplicate schema names: the spec shows the wrong shape for some operations

- **Observed:** the backend defines three view records with the same name in different modules: `SessionView` (identity device sessions, and academic sessions), `PaymentView`, and `InvoiceView`. The OpenAPI document keeps one schema per name, so `GET, POST /api/v1/sessions` and `PUT /api/v1/sessions/{id}` are documented with the device-session shape (`device`, `ipAddress`, `active`, `current`, `additionalProperties: false`). The backend's academic `SessionView` is `Id, Name, StartsOn, EndsOn, IsCurrent, IsArchived` (`src/SchoolHub.Modules.Academics/Features/Sessions/Sessions.cs`).
- **Effect:** the generated client types an academic session as a device session. Any screen built on it would be wrong, so the academic sessions screens are blocked. The payment and invoice views (F6) are at risk for the same reason.
- **Design-around:** none. The frontend does not hand-write the shape from the backend code (CLAUDE.md: types come from the generated client).
- **Status:** Resolved in the backend (b96a5aa) and in the frontend spec since 2026-11-21: unique schema ids (`AcademicsSessionView`, `IdentitySessionView`, `InvoiceView`, `PaymentView`). The screens use the typed shapes.

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

### B-20 — No immutable SchoolAdmin role; built-in roles accept writes

- **Observed:** on a plan with custom roles (dev-all), `PUT /api/v1/roles/{id}/permissions` on the built-in Registrar role, sending its own permissions unchanged, answered 200 (real backend, roles-journeys.spec.ts).
- **Contract:** no field marks a role as immutable, and the feature spec says system roles are "editable permissions only if plan allows custom roles; never deletable". The SchoolAdmin role is not described as immutable.
- **Effect:** the screen cannot lock SchoolAdmin on a rule of its own, and a built-in role can be changed on the plan that allows custom roles. The UI must not branch on the role name (CLAUDE.md), so it cannot protect SchoolAdmin itself.
- **Design-around:** none in the UI. The screen offers built-in roles as editable when the plan allows it.
- **Status:** Resolved (verified): the backend's `role.system_immutable` answers a permission removal with 422 and a no-change write with 200 (see the entry above). The contract declares no flag; the UI relies on the API.

### B-22 — Class level section is a free string in the contract, but an enum on the server

- **Contract:** `LevelRequest.section` and `LevelView.section` are `{"type":"string"}`. The contract lists no allowed values.
- **Server:** the backend parses `section` as its `ClassSection` enum (`SchoolHub.Modules.Academics/Domain/ClassStructure.cs`): `Creche`, `Nursery`, `Primary`, `JuniorSecondary`, `SeniorSecondary`. Any other text is refused with `academics.invalid` (seen on the real backend with a free-text section).
- **Design-around:** the class-level screen offers exactly those five values, from `CLASS_SECTIONS` in `src/features/academics/rules.ts`, with a comment pointing here. The real-backend journey creates a level with one of them.
- **Status:** Resolved: the contract now declares `LevelRequest.section` as an enum. The class-level section options are typed from the contract (`ClassSection` in `src/features/academics/rules.ts`).

### B-23 — Nullable response properties are declared non-null

- **Contract:** some optional response properties (for example middle names, guardian emails, optional dates) are declared as non-nullable strings in the spec, although the server can send `null`.
- **Server:** fixed in HEAD 729b182 for fixed-set (enum) properties only. Other nullable fields may still be declared non-null.
- **Effect:** generated types can say a value is present when it is not. A `null` reaching a string-only code path can break rendering or validation.
- **Design-around:** no field is assumed non-null because the generated type says so. Optional display values are rendered with a fallback, and optional dates and emails are checked before use.
- **Status:** Open. Ask the backend to audit nullable properties against the server models and declare them `nullable` in the contract.

### B-24 — User search (`GET /api/v1/users?q=`) answers 500 on the real backend

- **Observed:** on backend HEAD 729b182 with the development seed, every request with a `q` value answered `500 internal.error` (3 of 3 with `q=E2E`, and with `q=E2E Actor`). The same request without `q` answers 200. The backend log shows `The reader is closed` and an index-out-of-range error while iterating the query results (EF Core).
- **Effect:** the people screen's search box fails on the real backend. The fake API used by the browser tests answers search, so the defect is only visible in the real-backend suite. The suite pages through the list instead of searching.
- **Design-around:** the real-backend journey pages through the list ("Next page") to find its account. No journey searches.
- **Status:** Open. Ask the backend to fix the query (a likely concurrent use of one database context for the results and the count).

### B-25 — Subject category and calendar day type are free strings in the contract, enums on the server

- **Contract:** `SubjectRequest.category`, `SubjectView.category`, `CalendarDayRequest.type` and `CalendarDayView.type` are `{"type":"string"}` with no values listed.
- **Server:** the backend parses them as enums: `SubjectCategory` (`Core`, `Elective`, `Extra`, `SchoolHub.Modules.Academics/Domain/ClassStructure.cs`) and `CalendarDayType` (`Holiday`, `NonSchoolDay`, `SpecialEvent`, `Domain/CalendarDayType.cs`).
- **Design-around:** the subject and calendar screens offer exactly those values (`SUBJECT_CATEGORIES`, `CALENDAR_DAY_TYPES` in `src/features/academics/catalogue-rules.ts`), with a comment pointing here. The real-backend journey checks a `SpecialEvent` day is accepted.
- **Status:** Resolved: the contract now declares `SubjectRequest.category` and `CalendarDayRequest.type` as enums. The options are typed from the contract (`src/features/academics/catalogue-rules.ts`).

### B-26 — Assessment component weight has no stated meaning

- **Contract:** `ComponentRequest.weight` is an integer 0 to 100 (the backend validates that range) with no description.
- **Design-around:** the screen sends the component's maximum score as its weight, so the weights add up to the same 100 as the maximum scores. A different meaning would change the saved value.
- **Status:** Open. Ask the backend to document what `weight` means and whether it must total 100.

### B-27 — The `/sessions` shape in the contract is the device-session shape

- **Contract:** `GET /api/v1/sessions` and `POST /api/v1/sessions` answer `SessionView`, which describes a signed-in device (`device`, `ipAddress`, `startedAt`). Academic sessions (the school year, with terms) have no shape of their own in the reviewed spec.
- **Effect:** the calendar's school-days preview cannot pick a session and term from the typed contract, so it is not built. The academic session and rollover screens are blocked on the same shape.
- **Status:** Resolved: `GET /api/v1/sessions` now answers `AcademicsSessionView` (the device list is `/api/v1/me/sessions`, `IdentitySessionView`). The school-days preview and rollover use the typed shapes.

### B-29 — Intermittent database protocol errors under concurrent queries (500 internal.error)

- **Observed:** on the development backend (2026-11-21), the log shows `Npgsql.NpgsqlException: Received backend message BindComplete while expecting ParseCompleteMessage` and `ArgumentOutOfRangeException` while iterating query results on one `AppDbContext`. The same family as B-24 (`reader is closed`). A client sees `500 internal.error`, for example when starting authenticator enrolment (`POST /api/v1/me/mfa/enroll`).
- **Effect:** intermittent 500s on user search (B-24), on enrolment, and on `GET /api/v1/roles` (seen 2026-11-21 in the real-backend suite). Real-backend journeys that hit them fail at random.
- **Design-around:** the enrolment start and the role-list read are retried on a 500 (both are safe to repeat). Other calls are not retried.
- **Status:** Open. Ask the backend to check for concurrent use of one database context or connection within a request (the likely cause for both B-24 and B-29).

### B-28 — School settings PUT request bodies are declared as a bare object

- **Contract:** `PUT /api/v1/settings/school-profile`, `/branding` and `/policies` declare the request body as `{"type":"object"}` with no properties. The reads (`SchoolProfileView`, `BrandingSettingsView`, `PoliciesView`) are typed.
- **Design-around:** the settings screens send back the full view they read, with the same field names. The real-backend journey writes each view back with its current values (no change) and checks the backend answers 200 and reads the same values. The request type is cast in `src/features/settings/api.ts` and not hand-typed.
- **Status:** Open. Ask the backend to declare the three request bodies as the view shapes (or the request schemas), so the client can type them.
- **Found in use (2026-11-21):** the branding `logo` must be the id of a verified SchoolLogo upload (the backend's message says so; the contract does not). The PUT saves it, but its response echoes the previous logo value; a GET after the PUT returns the new one. The screens refetch after a save, so they show the saved value.

### B-30 — The file-content step has no declared request body

- **Contract:** `PUT /api/v1/files/{id}/content` declares no request body, but the step sends the file's bytes (the `uploadUrl` from `presign-upload`, with the file's own content type). The response is 204.
- **Design-around:** the bytes are sent through the BFF with the file's content type and not hand-typed. The test double allows this one operation to carry a raw body (`e2e/contract.ts`).
- **Status:** Open. Declare the request body (`application/octet-stream` or the file's types) so the upload is typed.

### B-31 — No student operation declares If-Match

- **Contract:** no student, guardian or document operation declares `If-Match`, although `StudentView.rowVersion` exists.
- **Design-around:** no `If-Match` is sent. Edits show the server's state after each save; concurrent edits are not detected in the UI.
- **Status:** Open. Declare `If-Match` on student and guardian updates (see also B-05).

### B-32 — Student records carry class arm ids, not names

- **Contract:** `StudentListItem.currentClassArmId` and `StudentView.currentClassArmId` are ids. The list cannot filter by class arm by name, and a profile cannot show the arm's name.
- **Design-around:** the arm is not shown on the list or the profile; the transfer and reinstatement pickers show level and arm names from the academic setup.
- **Status:** Open. Add the arm's name (and level name) to these views.

### B-33 — Import job status and the promotion outcomes are free strings

- **Contract:** `ImportJobView.status` is `{"type":"string"}` (the server's values are Queued, Validating, Validated, CommitQueued, Committing, Completed, Failed). `PromotionRequest.outcomes` has no item type.
- **Design-around:** the screens use the server's values as listed in `src/features/students/rules.ts` (IMPORT_WORKING, IMPORT_FINISHED). Promotion outcomes are sent as null (the server decides).
- **Status:** Open. Declare the status enum and the outcome items, as for B-22 and B-25.

### B-34 — The staff update says If-Match carries the rowVersion, but declares no header

- **Contract:** `PUT /api/v1/staff/{id}` has the summary "Replace a staff record's details (If-Match carries the rowVersion from the last read)", and `StaffView.rowVersion` exists. No operation declares an `If-Match` parameter. The same is true of `PATCH /api/v1/students/{id}` (B-31).
- **Design-around:** no `If-Match` is sent (`writePolicyHeaders` follows the declared parameters). Two people saving the same record: the later save wins, and the screen shows the server's state after the save.
- **Status:** Open. Declare `If-Match` on the staff and student updates, as the summaries already say (see also B-05, B-31).

### B-35 — Staff writes declare no Idempotency-Key

- **Contract:** `POST /api/v1/staff`, `POST /api/v1/staff/{id}/leave`, `POST /api/v1/staff/{id}/invite-user`, and the deactivate and reactivate operations declare no `Idempotency-Key`. Other creates in the contract do (for example student registration).
- **Design-around:** each button is disabled while its request is pending, so a double click sends one request. A retry after a dropped connection can still create a second record or leave request; the screens do not retry these writes.
- **Status:** Open. Declare `Idempotency-Key` on these creates and actions, so a retry is safe.

### B-36 — Staff and leave status values are free strings, and deactivation has no status mapping

- **Contract:** `StaffView.status` and `StaffListItem.status` are `string` (the list filter declares Active, OnLeave, Resigned, Terminated). `LeaveView.status` is a `string` with no values. `POST /api/v1/staff/{id}/deactivate` answers a `StaffView` but the contract does not say which status it sets.
- **Design-around:** a leave request is pending until `decidedAt` is set; the status text is shown but not used to decide anything. Both deactivate and reactivate stay available; the API decides whether the action applies.
- **Status:** Open. Declare the status enums for `StaffView` and `LeaveView`, and state the status each action sets.

### B-37 — Assignment and teacher views carry ids, not names

- **Contract:** `AssignmentView`, `ArmTeacherView` and `MyAssignmentsView` carry `classArmId` and `subjectId` (ids). `ArmTeacherView` carries `fullName` and `staffNo` but no class or subject name.
- **Design-around:** the assignments panel and "My classes" look names up in the academic setup (`useArmOptions`, `subjectsQuery`), which needs `academics.read`. Without it an arm shows as "A class arm" and a subject as "A subject".
- **Status:** Open. Add the arm and subject names to these views (see also B-32).

### B-38 — The row result of a register save is a free string, and the server's spelling differs from the spec's

- **Contract:** `RowOutcome.result` is `{"type":"string"}`. The feature spec (section 6) names the results `applied`, `ignored_newer_exists` and `rejected{reason}`.
- **Observed (2026-11-21):** the server answers `Applied`, and `IgnoredNewerExists` for a stale save. A refused row carries a reason.
- **Design-around:** the screens compare the result by its letters only (`rowResult` in `src/features/attendance/rules.ts`), so either spelling reads the same. A result this screen does not recognise keeps its row in the queue for the teacher; nothing is dropped.
- **Status:** Open. Declare the result as an enum with the server's spelling, so the client can type it.

### B-39 — A save for a past day needs a reason, and the contract does not say so

- **Contract:** `MarkRegisterRequest.reason` is nullable, and the PUT declares no error for a missing reason on a past register.
- **Observed:** the server refuses a save for a day before today with `attendance.reason_required` unless `reason` is set.
- **Design-around:** the screens send the register's own reason with every save (the offline queue keeps it with the register). The register screen does not ask the teacher for the reason on a past day yet (see OPEN_ITEMS).
- **Status:** Open. Document the rule on the PUT, or accept the reason as a field of the past-day flow.

### B-40 — The download route takes no query, so the term export is fetched through the BFF proxy

- **Contract:** `GET /api/v1/attendance/class-arms/{id}/term-summary.xlsx` needs `termId` as a query parameter.
- **Design-around:** the BFF download route refuses paths with a query (a deliberate rule). The export is a GET through the BFF proxy with the session (`downloadQueryFromApi` in `src/features/files/download.ts`), and its address carries ids only.
- **Status:** Open for a decision: keep the proxy route for queried downloads, or let the download route take a validated query. The proxy route is the working choice until then.

### B-41 — Invoice, payment and structure statuses are free strings

- **Contract:** `FeesInvoiceView.status`, `FeesPaymentView.status`, `FeesPaymentView.method`, `StructureView.status`, `StudentDiscountView.status` and `JobView.kind/status` are `string` with no values declared. The request bodies declare their enums (categories, discount kinds, adjustment kinds, payment methods), so only the responses are free.
- **Design-around:** the screens label the values the backend uses (invoice: Draft, Issued, Paid, Overdue, Void; payment: Pending, Succeeded, Reversed, ReversalRequested, Failed) and show any other value as it arrives.
- **Status:** Open. Declare the status enums on the responses, as for B-33.

### B-42 — No list of student discount grants, so approval is possible only from the grant's answer

- **Contract:** `POST /api/v1/students/{id}/discounts` answers the grant (with its `id`, which is the assignment id the approve path takes), and `POST /api/v1/students/{id}/discounts/{assignmentId}/approve` approves it. No operation lists a student's grants or the grants awaiting approval.
- **Design-around:** the grant form shows the grant's status and offers Approve for that grant only, to a holder of the approve permission. A grant made on another screen cannot be approved from this one.
- **Status:** Open. Add a list of grants (filtered by student and status) so a grant can be approved later.

### B-43 — Invoice generation answers counts at once; there is no job or progress for it

- **Contract:** `POST /api/v1/invoices/generate` (Idempotency-Key) answers `GenerateView` with the counts of created and skipped invoices. The feature plan expected a job with progress.
- **Design-around:** the screen waits for the answer and shows the counts; the button is disabled while the request is pending. A large class may take long, and the screen shows the pending state for that time.
- **Status:** Open for a decision: keep the synchronous answer (and bound its size), or add a job with progress like the import.

### B-44 — The contract has no bank details for transfers

- **Contract:** nothing in `docs/openapi/v1.json` gives the school's bank account name, number or bank, so a parent cannot be shown where to transfer money.
- **Design-around (ADR 0021):** the parent's screen shows the school's support email and phone (from the tenant summary's branding, which the contract provides) and the ward's admission number with a copy button, which the parent quotes on the transfer. The screen does not show account numbers it cannot source.
- **Status:** Open. When the contract provides account details, the screen will show them with copy buttons.

### B-45 — The contract has no list of a parent's payments

- **Contract:** the parent endpoints give the wards, a ward's invoices, online payment initialisation and verification by reference, and a receipt by payment id. No endpoint lists a parent's past payments.
- **Design-around (ADR 0021):** a receipt is offered only on the return screen, for a payment the parent has just verified. A parent cannot review earlier payments in the app.
- **Status:** Open. A list of a ward's payments (or of the parent's payments) would let the parent find and download earlier receipts.

### B-46 — Job status is a free string, and its values are not documented

- **Contract:** `JobView.status` is a string. The computation and the report card generation both return jobs, and the contract does not list the status values.
- **Design-around (ADR 0024, decision 2):** the screen shows the status as it arrives. A job is finished when every item is done, or when its status reads as completed or failed; an error is shown as the server's text.
- **Status:** Open. Ask the backend to document the values (queued, running, completed, failed).

### B-47 — No list of amendments

- **Contract:** amendments can be requested, approved and rejected by id. No operation lists them, and the request answer is the only place the id appears.
- **Design-around (ADR 0024, decision 5):** the requester is shown the reference and must give it to the approver, who enters it. A lost reference means a new request.
- **Status:** Open. A list of amendments by class and term would let an approver find pending ones.

### B-48 — A parent cannot find the current term, so the parent's results and report cards have no term to ask for

- **Contract:** the parent's results (`GET /me/wards/{id}/results`) and report cards (`GET /me/wards/{id}/report-cards`) need a `termId`. Nothing a parent can call lists terms: `/sessions` and `/sessions/{id}/terms` are for staff. The tenant summary has no current term.
- **Design-around:** none yet. The parent's results screen is deferred (ADR 0024, decision 6), so no parent screen asks for a term it cannot choose.
- **Status:** Open. Ask the backend for the current term in the parent's ward summary, or a parent-readable term list.

### B-49 — Announcement audiences, channels and statuses are free strings, and their values are not in the contract

- **Contract:** `AnnouncementBody.audience`, `channels` and `AnnouncementView.status` are strings. The contract lists no values.
- **Design-around (ADR 0025, slice 2):** the screen offers the audiences and channels the backend specification documents (all, levels, arms, staff, custom; sms, email, in-app). An audience or status the server sends that the screen does not know is shown as it arrives. Whether an announcement is open, sent or cancelled is read from its timestamps, not from its status word.
- **Status:** Open. Ask the backend to document the values, and to type them as enumerations in the contract.

### B-50 — Consent and data-request subject types are free strings, and their values are not documented

- **Contract:** `subjectType` on consents and data requests is a string. The backend specification names no vocabulary for it, and the contract lists none.
- **Design-around (ADR 0025, slice 5):** the screens take the subject type as the school types it, and say so. Purposes and channels are the contract's enumerations and are offered as choices.
- **Status:** Open. Ask the backend to document the subject types and make them an enumeration.
