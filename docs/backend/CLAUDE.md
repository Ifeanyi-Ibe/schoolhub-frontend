# CLAUDE.md — SchoolHub Backend (multi-tenant School Management SaaS)

> Placeholder product/namespace name: **SchoolHub**. Rename globally before scaffolding if desired.
> This file is loaded every session. Keep it authoritative and lean. Detailed feature specs live in
> `docs/FEATURE_SPEC.md`; the phased delivery plan lives in `docs/BUILD_PLAN.md`. **Read the relevant
> section of those files before implementing a module** (do not assume; do not skim).

---

## 0. Mission

Build the complete, production-grade backend of a cloud school management platform for small/medium
private schools in Lagos, Nigeria. One deployment serves many schools ("tenants").

Business scope: student registration, fees & payments, attendance, results & report cards, parent
notifications, staff/teacher records. Plus platform concerns: tenancy, subscriptions, auth, RBAC,
audit, observability.

Primary client: a Next.js PWA (separate repo) consuming this API. Parents mostly use low-end Android
phones on unreliable networks. Payments are mostly bank transfer + card via Paystack. Currency is NGN.

## 1. Working agreement (how you, Claude Code, must operate)

1. **Work phase by phase** per `docs/BUILD_PLAN.md`. Before each phase: output a short plan (files,
   entities, endpoints, tests). After each phase: all acceptance criteria met, build+tests green.
2. **Complete features only.** No stubs, no `NotImplementedException`, no `// TODO` in code you mark done.
   If something is genuinely blocked (needs a secret/credential), implement behind an interface with a
   working fake/dev implementation and document it in `docs/OPEN_ITEMS.md`.
3. **Every feature ships with**: validation, authorization (permission + data-scope), audit events where
   specified, structured logging, error mapping, idempotency where specified, OpenAPI metadata, and tests.
4. **Never weaken tenant isolation.** Never call `IgnoreQueryFilters()` outside code explicitly allowed
   in §7.6. Never accept `TenantId` from a request body.
5. **Verify before you claim.** Run `dotnet build -warnaserror`, `dotnet test`, `dotnet format --verify-no-changes`
   before declaring a phase done. Show failing output if anything fails; fix, don't hide.
6. **Do not invent APIs or package versions.** Check the installed package/SDK. For third-party providers
   (Paystack, Termii, WhatsApp Cloud API) confirm request/response shapes against current official docs
   when network/docs are available; otherwise code to the abstraction and note assumptions in
   `docs/OPEN_ITEMS.md`.
7. **Small, reviewable commits** (conventional commits). One concern per commit. Never commit secrets.
8. **Record decisions** as short ADRs in `docs/adr/NNNN-title.md` when you deviate from or refine this file.
9. **Ask (stop and list options) only** when a requirement is truly ambiguous AND the choice is costly to
   reverse. Otherwise choose the safest default, document it, continue.
10. When this file and a spec conflict, this file wins; flag the conflict in `docs/OPEN_ITEMS.md`.

Commands (create these scripts/Makefile targets in Phase 0):

```
dotnet build -warnaserror
dotnet test
dotnet format --verify-no-changes
docker compose up -d                      # postgres, seq, minio, mailpit
dotnet ef database update -p src/SchoolHub.Infrastructure -s src/SchoolHub.Api
dotnet run --project src/SchoolHub.Api
```

## 2. Tech stack (decisions are final unless an ADR changes them)

| Concern | Choice |
|---|---|
| Runtime | **.NET 10 (LTS)**, C# latest, nullable enabled, `TreatWarningsAsErrors`. Fall back to .NET 8 LTS only if the SDK is unavailable (record ADR). |
| API style | ASP.NET Core **Minimal APIs**, one endpoint class per feature, grouped per module. API versioning via `Asp.Versioning` (`/api/v1/...`). |
| DB | **PostgreSQL 16+**, EF Core + Npgsql, `EFCore.NamingConventions` (snake_case). Dapper allowed for read-heavy reports. |
| Multi-tenancy | Shared DB + shared schema, `tenant_id` on every tenant-owned table, **EF global query filters + PostgreSQL Row-Level Security** (defense in depth). |
| Auth | ASP.NET Core Identity primitives (hasher, lockout, token providers) with **custom stores/entities**; **JWT access tokens + rotating opaque refresh tokens**; TOTP MFA. |
| Authorization | **Permission-based RBAC** (per-tenant roles) + **data-scope rules** + plan feature gating. |
| Messaging pattern | Handlers (CQRS-lite) with decorators; **transactional outbox**; no MediatR/MassTransit/AutoMapper (commercial licensing). |
| Validation | FluentValidation. |
| Mapping | Mapperly (source generator) or hand-written mappers. |
| Jobs | Hangfire + `Hangfire.PostgreSql`. |
| Cache | `HybridCache` (in-memory L1; Redis L2 optional later). Cache keys MUST be tenant-prefixed. |
| Logging/Tracing | Serilog (JSON) + OpenTelemetry (OTLP) ; Seq in dev. |
| PDF | QuestPDF (receipts, report cards). Excel: ClosedXML. CSV: CsvHelper. Images: Magick.NET or SkiaSharp. |
| Storage | S3-compatible (AWS S3 / Cloudflare R2 / MinIO in dev) via `IFileStorage`. |
| OpenAPI | `Microsoft.AspNetCore.OpenApi` + Scalar UI. Served in **Development and Staging only**; Production answers 404 for the document and the UI (`OpenApiEnvironmentTests`). No Swagger UI. |
| Tests | xUnit, Shouldly (or AwesomeAssertions), Testcontainers (Postgres), Respawn, WireMock.Net, Bogus, NetArchTest. |
| Containers | Docker multi-stage, non-root, read-only FS where possible. |

Prefer built-ins (`TimeProvider`, `Guid.CreateVersion7()`, built-in rate limiter, `IExceptionHandler`,
`HybridCache`, `ProblemDetails`) over third-party equivalents.

## 3. Solution layout

```
SchoolHub.sln
src/
  SchoolHub.Api/                 # composition root: Program.cs, middleware, endpoint mapping, DI wiring
  SchoolHub.SharedKernel/        # Result/Error, Money, Entity bases, ITenantContext, IClock abstractions, paging
  SchoolHub.Infrastructure/      # AppDbContext, interceptors, migrations, outbox, storage, providers (Paystack, SMS...)
  SchoolHub.Modules.Tenancy/     # tenants, plans, subscriptions, settings, feature flags  (+ platform admin API)
  SchoolHub.Modules.Identity/    # users, roles, permissions, auth, sessions, invites, MFA
  SchoolHub.Modules.Academics/   # sessions, terms, class levels/arms, subjects, grading schemes, calendar
  SchoolHub.Modules.Students/    # students, guardians, enrolments, admissions, imports, promotions
  SchoolHub.Modules.Staff/       # staff profiles, teacher assignments, staff attendance
  SchoolHub.Modules.Attendance/
  SchoolHub.Modules.Assessment/  # scores, results computation, report cards, broadsheets
  SchoolHub.Modules.Fees/        # fee structures, invoices, payments, ledger, gateway, reconciliation
  SchoolHub.Modules.Notifications/ # templates, preferences, announcements, delivery, providers
  SchoolHub.Modules.Files/
  SchoolHub.Modules.Reporting/   # dashboards & cross-module read models
  SchoolHub.Modules.Audit/
tests/
  SchoolHub.UnitTests/
  SchoolHub.IntegrationTests/    # Testcontainers; full HTTP pipeline via WebApplicationFactory
  SchoolHub.ArchitectureTests/
docs/  (BUILD_PLAN.md, FEATURE_SPEC.md, OPEN_ITEMS.md, adr/, runbooks/)
deploy/ (Dockerfile, docker-compose.yml, compose.prod.example.yml, github workflows in .github/)
```

Each module folder: `Domain/` (entities, value objects, domain rules/events), `Features/<UseCase>/`
(Command|Query, Handler, Validator, Endpoint, Dto), `Persistence/` (EF configurations), `Module.cs`
(`AddXModule(IServiceCollection)` + `MapXEndpoints(IEndpointRouteBuilder)`), and `Contracts/` (the only
types other modules may reference: integration events, public interfaces).

Single `AppDbContext` (one schema, `public`) with per-module `IEntityTypeConfiguration` classes discovered
by assembly scan. Tables are prefixed by module only if names collide.

## 4. Architecture rules (enforced by architecture tests)

1. Modules reference only `SharedKernel` and **other modules' `Contracts`**; never another module's Domain/Features.
2. `Domain` has no dependency on EF Core, ASP.NET, or Infrastructure.
3. Endpoints contain no business logic: bind → authorize → dispatch handler → map result.
4. Handlers return `Result<T>`; throwing is for unexpected failures only.
5. Cross-module side effects use **integration events via the outbox**, not direct calls
   (queries across modules go through `Contracts` interfaces).
6. No `DateTime.UtcNow`/`DateTime.Now`; inject `TimeProvider`.
7. No `float`/`double` for money. No `decimal` columns for money; see §6.
8. Every tenant-owned entity implements `ITenantOwned`; architecture test fails if one is missing the
   tenant filter or an RLS policy (test reads `pg_policies`).
9. Public endpoints (`AllowAnonymous`) must be listed in an allow-list test; adding one requires intent.
10. Every endpoint declares exactly one of: `.RequirePermission(...)`, `.RequireAuthorization(policy)`, `.AllowAnonymous()` — verified by test.

Handler pipeline (decorators registered via Scrutor, outermost first):
`Logging → Validation → Authorization-scope (optional) → Transaction (commands) → Handler`.
Commands run in one DB transaction that includes outbox + audit rows.

## 5. Coding conventions

- Files: one type per file; feature folders; `sealed` by default; primary constructors for DI.
- Names: PascalCase C#; snake_case DB; JSON **camelCase**; enums serialized as **strings**; dates `DateOnly`
  (ISO), instants `DateTimeOffset` UTC; display zone `Africa/Lagos` (tenant-configurable).
- IDs: `Guid.CreateVersion7()` (sortable). Public identifiers are GUIDs; human numbers (admission no., receipt no.,
  invoice no.) are separate, per-tenant, gap-tolerant sequences generated atomically (`tenant_sequences` table with
  `UPDATE ... RETURNING`).
- Entities: private setters, factory methods/behaviors, invariants enforced in the domain; no anemic public setters.
- Async everywhere, pass `CancellationToken`, no `.Result`/`.Wait()`.
- Pagination: `?page=1&pageSize=25` (max 100) → `{ items, page, pageSize, totalCount, totalPages }`; sorting/filter fields via
  whitelists (never raw column names from the client). Cursor pagination for large append-only lists (audit, notifications).
- Concurrency: optimistic via Postgres `xmin` mapped as `uint RowVersion` (`IsRowVersion()`); updates accept `If-Match`/`rowVersion`;
  conflicts → 409 `concurrency.conflict`.
- Soft delete (`IsDeleted`, `DeletedAt`, `DeletedBy`) for business entities; hard delete only for ephemeral data. Financial and audit
  records are **never** deleted or edited; they are reversed/compensated.
- Strings: trim and normalize input; max lengths enforced in validators **and** DB. Phone numbers stored E.164 (`+234…`);
  normalize Nigerian formats (`080…`, `234…`) on input.
- All public endpoints are documented with OpenAPI summary, tags, produces/consumes, and `ProblemDetails` responses.
- Comments explain *why*; XML docs on public contracts.

## 6. Data conventions

- **Money**: store as `bigint` **kobo** (`amount_kobo`) + `currency` char(3) default `NGN`. C# `Money` value object (`long Kobo`,
  `string Currency`); arithmetic via methods that prevent cross-currency ops. Percentages in basis points (`int`). Rounding: banker's
  rounding only where a split is needed; document it.
- Every table: `id uuid pk`, `tenant_id uuid not null` (tenant-owned), `created_at`, `created_by`, `updated_at`, `updated_by`, `xmin` token.
- Unique indexes on business keys **always include `tenant_id`** (e.g. `(tenant_id, admission_no)`).
- Index every FK and every filter used by list endpoints; add partial indexes for `is_deleted = false` on hot tables.
- `jsonb` only for audit diffs, provider payloads, flexible settings. Everything else relational.
- Migrations: forward-only, reviewed, **expand/contract** for breaking changes. Production applies migrations via a
  migration bundle in the deploy pipeline, **never at app startup** (dev/test may auto-migrate).
- DB roles: `schoolhub_owner` (runs migrations), `schoolhub_app` (runtime; **no BYPASSRLS, not table owner**),
  `schoolhub_readonly` (reporting). `audit_logs` grants INSERT+SELECT only to `schoolhub_app`.

## 7. Multi-tenancy (critical)

### 7.1 Model
`Tenant { Id, Slug (unique, subdomain), Name, Status: Trial|Active|PastDue|Suspended|Cancelled, PlanId, Timezone, Currency,
CustomDomain?, CreatedAt }`. Users belong to exactly one tenant (a person at two schools has two accounts), except platform staff
(`tenant_id = null`, `UserType = Platform`).

### 7.2 Resolution (middleware, runs after auth)
1. Authenticated: tenant = JWT claim `tid` (authoritative).
2. Unauthenticated tenant-scoped endpoints (login, forgot password, public admissions): tenant = request host subdomain
   `{slug}.{BaseDomain}` (or verified custom domain). In Development only, header `X-Tenant: {slug}` is honored.
3. If both exist and differ → `403 tenancy.mismatch`.
4. Unknown/cancelled tenant → `404 tenancy.not_found` (don't reveal existence nuance). Suspended → see §8.4.
5. Platform endpoints (`/api/v1/platform/**`) require `UserType=Platform` and run with `ITenantContext.IsPlatform = true`.

### 7.3 Abstractions
```csharp
public interface ITenantContext { Guid? TenantId { get; } string? Slug { get; } bool IsPlatform { get; } }
public interface ITenantScopeFactory { IDisposable BeginScope(Guid tenantId); IDisposable BeginPlatformScope(); } // jobs, webhooks
public interface ITenantOwned { Guid TenantId { get; } }
```
`TenantId` is stamped by a `SaveChanges` interceptor on insert; setting a different tenant's id throws.

### 7.4 Query filter + RLS (both mandatory)
```csharp
// AppDbContext.OnModelCreating — EF Core 10 named filters so SoftDelete can be ignored independently of Tenant
foreach (var et in modelBuilder.Model.GetEntityTypes().Where(t => typeof(ITenantOwned).IsAssignableFrom(t.ClrType)))
    typeof(AppDbContext).GetMethod(nameof(ApplyTenantFilter), BindingFlags.NonPublic | BindingFlags.Instance)!
        .MakeGenericMethod(et.ClrType).Invoke(this, [modelBuilder]);

void ApplyTenantFilter<T>(ModelBuilder mb) where T : class, ITenantOwned =>
    mb.Entity<T>().HasQueryFilter("Tenant", e => _tenant.IsPlatform || e.TenantId == _tenant.TenantId);
// ISoftDeletable entities also get: HasQueryFilter("SoftDelete", e => !e.IsDeleted)
```
```sql
-- generated for EVERY tenant table (migration helper / architecture-test enforced)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON students
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
              OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
              OR current_setting('app.bypass_rls', true) = 'on');
```
A `DbConnectionInterceptor` runs `SELECT set_config('app.tenant_id', @tid, false), set_config('app.bypass_rls', @bypass, false)` on
`ConnectionOpened` from `ITenantContext`. Keep Npgsql's default pool reset (do **not** set `No Reset On Close`) so session state never leaks
between pooled connections. `app.bypass_rls='on'` is set only inside `BeginPlatformScope()`.

### 7.5 Everything else tenant-aware
Cache keys `t:{tenantId}:...`; storage keys `tenants/{tenantId}/...`; Hangfire jobs carry `tenantId` and open a scope; outbox messages carry
`tenant_id`; logs/traces tagged with tenant; rate-limit partitions include tenant; webhooks resolve tenant from the matched record (never from payload trust).

### 7.6 Where `IgnoreQueryFilters()` / platform scope is allowed
Only: platform admin handlers, tenant resolution lookup, webhook receivers (after resolving tenant), maintenance jobs. Each use needs a
`// TENANT-BYPASS: reason` comment; an architecture test greps for undocumented uses.

### 7.7 Isolation tests (mandatory, run in CI)
Automated test that, for **every** list/get/update/delete endpoint discovered via endpoint metadata, creates data in tenant A, authenticates as tenant B,
and asserts 404/empty. Plus a raw-SQL test proving RLS blocks cross-tenant reads even with filters disabled.

## 8. Authentication

### 8.1 Entities
`users` (id, tenant_id?, user_type: Platform|Staff|Parent|Student, email?, phone?, normalized_*, password_hash?, security_stamp, status: Invited|Active|Locked|Disabled,
email_confirmed, phone_confirmed, mfa_enabled, failed_count, lockout_end, last_login_at, linked_staff_id?, linked_guardian_id?, linked_student_id?),
`refresh_tokens` (id, tenant_id?, user_id, family_id, token_hash, device_info, ip, created_at, expires_at, rotated_at?, revoked_at?, replaced_by?),
`user_mfa` (secret encrypted, recovery codes hashed), `otp_challenges` (hash, purpose, target, attempts, expires_at, consumed_at), `invites`, `password_reset_tokens`.
Unique: `(tenant_id, normalized_email)` and `(tenant_id, normalized_phone)` where not null.

### 8.2 Tokens
- **Access token**: JWT, **15 min**, asymmetric (ES256 or RS256) with `kid`; keys from config/secret store, rotation supported (JWKS-style key set, old keys valid until expiry).
  Claims: `sub`, `tid`, `utype`, `sid` (session/family id), `sstamp` (security stamp prefix), `roles` (display-only: role names as of sign-in; never read for authorization), `jti`. **No permissions in the token** (size + staleness). See ADR 0010.
- **Refresh token**: 256-bit random opaque, stored **SHA-256 hashed**, **rotated on every use**, 30-day sliding expiry (absolute max 90 days), bound to family.
  **Reuse detection**: presenting an already-rotated token revokes the whole family and logs a security audit event `auth.refresh_reuse_detected`.
- Validate on each request: signature, expiry, `tid` matches tenant, user status Active, `sstamp` matches current security stamp (cached ≤60s).
  Password change / disable / MFA reset / "log out everywhere" bumps the stamp ⇒ immediate invalidation of access tokens and refresh families.
  Role changes do **not** bump the stamp: they bump the school's permissions version (ADR 0010), so sessions survive and permissions change on the next request.
- Web client stores the refresh token in an **httpOnly, Secure, SameSite cookie set by the Next.js server (BFF)**; API itself returns it in JSON.

### 8.3 Flows (all implemented, all audited, all rate limited)
Login (email or phone + password) · Parent login via **phone OTP** (6 digits, hashed, 5 min TTL, max 3 attempts, resend cooldown 60s, per-phone & per-IP limits) ·
Refresh · Logout · Logout-all · Session list/revoke · Forgot/reset password (single-use hashed token, 1h) · Change password · Invite acceptance (72h token, sets password) ·
Email/phone verification · TOTP MFA enroll/verify/disable + recovery codes (required for SchoolAdmin if tenant policy says so; **required for Platform users**) ·
Account lockout (5 failures → 15 min, exponential for repeat offenders) · Password policy (min 10 chars, denylist of common passwords, no breached check required but pluggable HIBP k-anonymity port).
Login responses must be **uniform** for unknown user vs wrong password (no enumeration) and constant-time where feasible.

### 8.4 Tenant status gating
- `Trial`/`Active`: full access per plan. `PastDue`: full access + banner flag `tenant.pastDue` in `/me`. `Suspended`: all write endpoints → `402 billing.suspended`;
  reads allowed for SchoolAdmin only; `/billing/**` and `/auth/**` stay open. `Cancelled`: login blocked, data retained per retention policy.

### 8.5 Support access (platform → tenant)
Platform "support session" = time-boxed (≤60 min) impersonation token with `act` claim, requires reason, requires tenant setting `allowSupportAccess=true`, read-only unless
explicitly elevated, **fully audited** and visible to the SchoolAdmin in their audit log.

## 9. Authorization

Three layers, all mandatory where applicable:

1. **Permissions (RBAC)** — string constants `area.resource.action` in `Permissions.cs`, e.g. `students.read`, `students.write`, `fees.invoices.create`,
   `fees.payments.record`, `fees.payments.reverse`, `results.scores.enter`, `results.publish`, `attendance.mark`, `audit.read`, `roles.manage`.
   Catalog synced to `permissions` table on startup (global). **Roles are per-tenant** (`roles`, `role_permissions`, `user_roles`); system roles seeded on tenant creation and
   marked `is_system` (editable permissions only if plan allows custom roles; never deletable): `SchoolAdmin` (all tenant permissions), `Registrar`, `Bursar`, `Teacher`, `FormTeacher`,
   `Parent`, `Student`. Effective permissions resolved server-side per request from cache (`t:{tid}:u:{uid}:perms:{permissionsVersion}:{stamp}`). Any role create, edit, delete or assignment change bumps the school's permissions version, so every holder sees the change on the next request without a per-user write (ADR 0010).
   Endpoint usage: `.RequirePermission(Permissions.Students.Write)` (custom `IAuthorizationHandler`, `PermissionRequirement`). Platform permissions are a separate catalog (`platform.*`).
2. **Data scope** — enforced in handlers through `IAccessScope` (never trust ids from the client):
   Teacher → only assigned class arms/subjects (unless `*.all` permission); Parent → only linked wards; Student → only self; Bursar → fees but not medical/disciplinary data.
   Out-of-scope access returns **404** (not 403) to avoid existence leaks, except for explicit permission failures (403).
3. **Plan/feature gating** — `.RequireFeature(Features.WhatsApp)` consults tenant plan entitlements + overrides; limits (max students, SMS credits) enforced in handlers returning
   `402/409 plan.limit_reached`.

Security-sensitive data (medical notes, national IDs if ever stored, guardian contact details) requires dedicated permissions and column-level encryption (§10.8).
Maker–checker: operations flagged in spec (payment reversal, results amendment after publish, bulk fee waivers) require a **different** user to approve.

## 10. Cross-cutting standards

### 10.1 Result & errors
```csharp
public enum ErrorType { Validation, NotFound, Conflict, Forbidden, Unauthorized, Unprocessable, TooManyRequests, Unexpected }
public sealed record Error(string Code, string Message, ErrorType Type, IReadOnlyDictionary<string,string[]>? Fields = null);
public readonly record struct Result<T>(T? Value, Error? Error) { public bool IsSuccess => Error is null; /* factory helpers */ }
```
Error codes are stable machine strings `module.reason` (e.g. `fees.invoice_already_paid`, `students.duplicate_admission_no`). Keep a catalog in `docs/ERROR_CODES.md` (generated/updated by tests).

A global `IExceptionHandler` + `ProblemDetails` (RFC 9457) produces consistent bodies:
`{ type, title, status, detail, instance, traceId, code, errors? }`. Mapping: Validation→400 (field errors) · Unauthorized→401 · Forbidden→403 · NotFound→404 · Conflict/concurrency/unique-violation→409 ·
Unprocessable (business rule)→422 · TooManyRequests→429 (+`Retry-After`) · Unexpected→500 **without internals** (log full exception with `traceId`).
Also JSON bodies for 401/403/404/405/415 produced by the pipeline. Postgres `23505`→409 `conflict.duplicate`, `23503`→409 `conflict.reference`, `40001/40P01`→retry then 409/503.
Use `EnableRetryOnFailure` (Npgsql) with a custom execution strategy; commands that call external systems are never retried blindly inside a transaction.

### 10.2 Validation
FluentValidation per command/query; validators run in the pipeline; return **all** field errors. Validate: lengths, formats (E.164, email), enums, date ranges, referential existence (in handler), file types/sizes.
Reject unknown/overposted fields (use dedicated request DTOs, `JsonUnmappedMemberHandling.Disallow`).

### 10.3 Logging (Serilog)
- JSON to stdout; sinks: Seq (dev), OTLP (prod). Request logging middleware (method, route template, status, elapsed) — excludes `/health/*`.
- Enrichers on every event: `CorrelationId` (from `X-Correlation-Id` or generated; echoed in response), `TraceId`, `TenantId`, `UserId`, `UserType`, `Environment`, `Version`.
- **Never log**: passwords, tokens, OTPs, secrets, full card/bank data, full phone/email (mask: `+234***1234`), health data, request bodies by default.
- Levels: Debug (dev only) · Information (business milestones) · Warning (recoverable, e.g. webhook dup, retry) · Error (failed operation) · Fatal (startup failure).
- Message templates (not interpolation). Use `LoggerMessage` source generators in hot paths.
- OpenTelemetry traces for HTTP, EF Core, HttpClient, Hangfire; metrics: request duration, outbox lag, job failures, payment webhook latency, notification send success rate.

### 10.4 Audit logging (distinct from app logs)
`audit_logs` (append-only, partitioned monthly by `occurred_at`): `id, tenant_id?, occurred_at, actor_user_id?, actor_type (User|System|Platform|Webhook|Support), actor_ip, user_agent,
correlation_id, action (e.g. "student.created"), entity_type, entity_id, summary, changes jsonb ({field:{old,new}}), metadata jsonb, outcome (Success|Denied|Failed)`.
- **Automatic**: EF `SaveChanges` interceptor records create/update/delete diffs for entities annotated `[Audited]`; properties annotated `[AuditIgnore]`/`[Sensitive]` are omitted or masked.
- **Explicit**: `IAuditLogger.LogAsync(...)` for business/security events: login success/failure, MFA, role/permission changes, user invited/disabled, payment recorded/reversed/verified,
  invoice voided, results published/amended, data export, support access, settings changes, bulk imports, tenant status changes, failed authorization attempts (rate-limited).
- Audit rows are written in the **same transaction** as the change (outbox-style) so no change is un-audited.
- DB-level protection: app role has no UPDATE/DELETE on `audit_logs`. Retention configurable per tenant (default ≥ 7 years for financial events, 2 years others). Query/export endpoints require `audit.read`; platform has cross-tenant view.

### 10.5 Idempotency
Two layers:
1. **HTTP layer** — endpoints marked `.RequireIdempotency()` (all create/payment/bulk/send POSTs listed in the spec) require header `Idempotency-Key` (8–128 chars, client-generated UUID/ULID).
   Table `idempotency_keys(tenant_id, key, scope_hash, user_id, method, route, request_hash, status InProgress|Completed, response_status, response_headers jsonb, response_body bytea, created_at, expires_at)`;
   unique `(tenant_id, user_id, key, route)`. Flow: `INSERT … ON CONFLICT DO NOTHING` →
   new: execute, store response, return · same key + same `request_hash` + Completed: **replay** stored response with `Idempotency-Replayed: true` ·
   same key + different hash: `422 idempotency.key_reuse_mismatch` · InProgress: `409 idempotency.in_progress` + `Retry-After: 2`.
   Only successful (2xx) and deterministic 4xx(422/409 business) responses are stored; 5xx are not (client may retry). TTL 48h; cleanup job.
2. **Business layer** — natural keys & unique constraints make operations safe even without headers: payment `reference` unique per tenant; webhook events deduped by `(provider, event_id)`;
   invoice generation unique `(tenant_id, student_id, term_id, fee_structure_id)`; attendance upsert by `(student_id, date)`; score upsert by `(student_id, subject_id, term_id, component_id)`;
   notification dedupe key; outbox consumers record processed message ids.

### 10.6 Transactional outbox & background work
`outbox_messages(id, tenant_id?, type, payload jsonb, occurred_at, available_at, attempts, processed_at, error)` written inside the command transaction. Dispatcher (Hangfire recurring + on-commit nudge) uses
`SELECT … FOR UPDATE SKIP LOCKED`, exponential backoff, dead-letter after N attempts (alert metric). Consumers are idempotent (`processed_messages`).
Hangfire dashboard: platform admins only, behind auth. All jobs are idempotent, tenant-scoped, and time-bounded.

### 10.7 HTTP hardening
HTTPS + HSTS · forwarded headers configured for the reverse proxy · security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy` for docs UI, `Cache-Control: no-store` on auth/PII responses) ·
CORS allow-list from tenant domains + configured origins (no wildcard with credentials) · request body limits (default 1 MB; uploads via presigned URLs) · response compression ·
**Rate limiting** (built-in): anonymous per-IP strict on `/auth/**` & OTP; authenticated per tenant+user token bucket; separate tight policy for OTP/send endpoints; 429 with `Retry-After` ·
API versioning · `ETag`/`If-None-Match` on cacheable reads · request timeout middleware · `X-Request-Id`/`X-Correlation-Id`.

### 10.8 Data protection (NDPA 2023)
Encrypt sensitive columns (medical notes, MFA secrets, provider credentials per tenant) with ASP.NET Data Protection or an envelope-encryption `IFieldEncryptor` (keys in secret store, persisted key ring in DB/volume).
Consent records (`consents`: subject, purpose, channel, granted_at, withdrawn_at, source). Data-subject endpoints: export a student/guardian's data; erase/anonymize after retention (job).
Minimize PII in logs/URLs. Tenant data export (zip of CSVs) and tenant offboarding runbook. DB and file backups encrypted; restore tested quarterly (`docs/runbooks/restore.md`).

### 10.9 Health, config, secrets
`/health/live` (process) and `/health/ready` (DB, outbox lag, storage) · `IOptions` + `ValidateOnStart` for every config section · config via env vars (`Section__Key`) · secrets from environment/secret manager
(never in repo; `.env.example` only) · feature flags in DB (per tenant/plan) · build info endpoint (version, commit) for platform admins.

## 11. Testing standard (part of "done")

- **Unit**: domain rules, calculators (grading, positions, fee allocation, late fees), validators, Money, phone normalization. Target ≥ 85% on Domain/Application logic.
- **Integration** (Testcontainers Postgres, real migrations, real RLS, `WebApplicationFactory`): every endpoint happy path + auth failures (401/403/404-scope) + validation (400) + conflict (409) + idempotent replay.
  Use the *app* DB role (not owner) so RLS is exercised.
- **Tenant isolation suite** (§7.7). **Permission matrix test** (role × endpoint expectations generated from metadata, reviewed snapshot).
- **Provider contract tests** with WireMock.Net (Paystack init/verify/webhook signatures, SMS/WhatsApp/email adapters; failure/timeout cases).
- **Concurrency/idempotency tests**: parallel duplicate payment webhooks credit exactly once; parallel identical idempotent POSTs execute once.
- **Architecture tests** (NetArchTest) for §4 rules.
- **Performance smoke** (k6 or NBomber script in `tests/perf/`): login, list students (10k rows), mark attendance for a class, publish results for 500 students, webhook burst.
- CI fails on any warning, failing test, format drift, vulnerable package (`dotnet list package --vulnerable --include-transitive`), or Docker build failure.

### 11.1 Enforced rules (added 2026-11-13, ADR 0013)

- **Transactions.** An explicit transaction runs inside `Database.CreateExecutionStrategy()`. With the retrying Npgsql strategy on, a transaction outside it is refused at runtime. `ExecutionStrategyRuleTests` fails the build when a source file opens a transaction without the strategy.
- **Background jobs.** A failed job run goes through `BackgroundJobFailure.Report`: an Error log that names the job, and an increment of `schoolhub.background_job.failures` tagged by job. `BackgroundJobFailureTests` proves both.

## 12. Definition of Done (per feature)

- [ ] Endpoint(s) implemented per spec with correct HTTP semantics + OpenAPI docs
- [ ] Endpoint documented per `docs/API.md` (summary, module tag, one access rule, idempotency where it writes, error responses, no stored secrets in any schema) and covered by `OpenApiDocumentTests` and the operation snapshot
- [ ] Validation + stable error codes
- [ ] Permission + data-scope + (feature gating if listed)
- [ ] Tenant isolation proven by test
- [ ] Audit events + structured logs (no PII leakage)
- [ ] Idempotency (if listed) + concurrency token handling
- [ ] Outbox events/notifications (if listed)
- [ ] Migrations + indexes + RLS policy
- [ ] Unit + integration tests green; coverage targets met
- [ ] `docs/FEATURE_SPEC.md` checkbox ticked; `docs/ERROR_CODES.md` updated; no new items left silently in `OPEN_ITEMS.md`

## 13. Non-goals (do NOT build in the backend v1)

Payroll/salary processing, timetable generation, library/inventory/hostel/transport modules, LMS/e-learning, biometric attendance hardware integration,
multi-currency, native mobile push (web push endpoints are provided; native is later), AI features. Keep extension points (interfaces/events) so they can be added.