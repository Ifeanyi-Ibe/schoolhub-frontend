# FEATURE_SPEC.md — Backend Feature Specification

Companion to `CLAUDE.md` (which wins on conflicts). Read the module's section before implementing it.
Legend: **[I]** = requires `Idempotency-Key` · **[A]** = audited explicitly · **[MC]** = maker–checker · **[E]** = emits outbox event · `perm` = required permission.
Base path `/api/v1`. All list endpoints support pagination, whitelisted sort/filter, and `q` search where noted. Tick boxes as features are completed.

Permission catalog (seed; extend as needed): see §P at the bottom.

---

## 1. Tenancy & Platform (module `Tenancy`)

### Entities
`Tenant`, `Plan` (code, name, price_kobo_monthly, max_students, max_staff, sms_credits_monthly, entitlements jsonb), `PlanFeature` (plan_id, feature_key),
`TenantFeatureOverride`, `Subscription` (tenant, plan, status Trial|Active|PastDue|Suspended|Cancelled, period_start, period_end, next_billing_at, trial_ends_at, paystack_customer/auth refs),
`SubscriptionInvoice`, `SubscriptionPayment`, `TenantSetting` (key/value typed; see §1.3), `TenantDomain` (custom domain, verified_at), `TenantSequence` (key, next_value).

### 1.1 Platform admin API (`/platform/**`, UserType=Platform + MFA)
- [ ] `POST /platform/tenants` **[I][A]** `platform.tenants.create` — creates tenant, slug validation (a-z0-9-, reserved list), seeds system roles + default grading scheme + default settings, creates first SchoolAdmin user (invite email/SMS), starts trial (configurable days).
- [ ] `GET /platform/tenants` (q, status, plan) · `GET /platform/tenants/{id}` (usage: students, staff, SMS credits, last activity)
- [ ] `PATCH /platform/tenants/{id}` **[A]** · `POST /platform/tenants/{id}/suspend|reactivate|cancel` **[A]** (reason required)
- [ ] `PUT /platform/tenants/{id}/plan` **[A]** · `PUT /platform/tenants/{id}/features/{key}` (override) **[A]**
- [ ] `GET/POST/PUT /platform/plans` · `GET /platform/audit` (cross-tenant)
- [ ] `POST /platform/tenants/{id}/support-sessions` **[A]** (see CLAUDE.md §8.5)
- [ ] `GET /platform/metrics` (tenants by status, MRR, churn, SMS usage) *(Phase 9: built; SMS usage not included, OI-122)*

### 1.2 Public signup (optional, feature-flagged)
- [ ] `POST /public/signup` **[I]** anonymous, CAPTCHA token verified, strict rate limit, email/phone verification before activation; creates a Trial tenant via the same code path as 1.1.
- [ ] `GET /public/tenants/{slug}/branding` (anonymous; name, logo URL, colors only) for login page theming.

### 1.3 Tenant self-service (`/settings/**`, SchoolAdmin)
- [x] `GET/PUT /settings/school-profile` `settings.manage` (name, address, phones, email, logo, motto, principal name/signature, LGA/state, registration no.) — logo upload waits for Files (OI-041)
- [x] `GET/PUT /settings/branding` (primary/secondary color, logo, report-card header)
- [x] `GET/PUT /settings/policies`: `adminNoFormat` (`{PREFIX}/{YY}/{SEQ:4}`), `receiptNoFormat`, `invoiceNoFormat`, `results.requireFeesCleared`, `results.feesClearedThresholdPct`, `attendance.absenceAlert`, `attendance.lateCutoff`, `notifications.quietHours` (default 21:00–06:00 Africa/Lagos), `security.requireMfaForAdmins`, `security.allowSupportAccess`, `timezone`.
- [x] `GET /me/tenant` (plan, entitlements, usage vs limits, status flags) — student, staff and SMS usage counts wait for later modules (OI-041)

### 1.4 Subscription billing (tenant → platform)
- [ ] Monthly billing job generates `SubscriptionInvoice` per active tenant (idempotent by `(tenant, period)`), charges stored Paystack authorization or sends pay link; webhook marks paid. *(Phase 9: the job issues invoices once per period and records reminders; the charge goes through the gateway port, and the live charge and webhook are OI-110)*
- [ ] Dunning: due → `PastDue` (grace 7 days, reminders D-3/D0/D+3/D+7 via platform notifications) → `Suspended`; payment restores instantly. All transitions audited and emit `TenantStatusChanged`. *(Phase 9: the state machine is built and tested; reminder delivery is OI-124)*
- [ ] `GET /billing/subscription`, `GET /billing/invoices`, `POST /billing/pay` **[I]** (tenant admin; allowed even when Suspended), `GET /billing/usage`. *(Phase 9: built; `GET /billing/usage` is OI-122)*
- [ ] Limits: creating students beyond `max_students` → `409 plan.limit_reached` (with upgrade hint). *(Phase 9: not built, OI-122)*

---

## 2. Identity, Roles & Permissions (module `Identity`)

Auth flows per CLAUDE.md §8. All endpoints under `/auth` and `/me`, `/users`, `/roles`.

- [ ] `POST /auth/login` (identifier+password) → `{accessToken, refreshToken, expiresIn, mfaRequired?, mfaToken?}` · rate-limited **[A: success/failure]**
- [ ] `POST /auth/mfa/verify` · `POST /auth/otp/request` / `POST /auth/otp/verify` (parent phone login; purpose-bound, hashed codes)
- [ ] `POST /auth/refresh` (rotation + reuse detection) · `POST /auth/logout` · `POST /auth/logout-all`
- [ ] `POST /auth/forgot-password` (always 202) · `POST /auth/reset-password` · `POST /auth/change-password`
- [ ] `POST /auth/accept-invite` · `POST /auth/verify-email` / `verify-phone` + resend
- [ ] `GET /me` (profile, roles, effective permissions, linked entities, tenant flags) · `PATCH /me` · `GET/DELETE /me/sessions[/{id}]`
- [ ] `POST /me/mfa/enroll` / `confirm` / `disable` / `recovery-codes/regenerate`
- [ ] Users (staff accounts): `GET /users` · `POST /users/invite` **[I][A]** `users.invite` · `PATCH /users/{id}` · `POST /users/{id}/disable|enable|unlock|reset-mfa` **[A]** `users.manage` · `PUT /users/{id}/roles` **[A]** `roles.assign`
  (cannot remove last SchoolAdmin; cannot escalate beyond own permissions — a user may only assign roles whose permissions ⊆ their own unless SchoolAdmin).
- [ ] Parent/student account provisioning: auto-create **Parent** user (phone-based) when a guardian is marked `portalAccess` (invite by SMS); **Student** accounts optional (secondary school feature flag).
- [ ] Roles: `GET /roles` · `POST /roles` (custom; plan-gated) **[A]** · `PUT /roles/{id}/permissions` **[A]** `roles.manage` · `DELETE /roles/{id}` (non-system, unused)
- [ ] `GET /permissions` (catalog grouped by area, descriptions) — drives the admin UI.
- [ ] Security stamp bump + cache invalidation on any role/permission/password/status change.
- [ ] Seed: system roles per tenant with default permission sets (§P).

---

## 3. Academics (module `Academics`)

### Entities
`AcademicSession` (name "2026/2027", start/end, is_current), `Term` (session, number 1–3, name, start, end, next_term_begins, is_current; exactly one current term per tenant),
`ClassLevel` (code, name, order, section: Creche|Nursery|Primary|JuniorSecondary|SeniorSecondary), `ClassArm` (level, name "A", capacity, form_teacher_staff_id?),
`Subject` (code, name, category: Core|Elective|Extra), `ClassLevelSubject` (level, subject, is_compulsory), `GradingScheme` (name, is_default) + `GradeBand` (min, max, grade, remark, gpa?),
`AssessmentScheme` (name) + `AssessmentComponent` (name "CA1", max_score, weight, order) — sum of max must equal 100 (validated),
`AffectiveDomain`/`PsychomotorDomain` trait definitions (name, scale 1–5), `CalendarDay` (date, type: Holiday|NonSchoolDay|SpecialEvent, name), `Holiday` bulk import for Nigerian public holidays (editable).

### Rules
- Only one current session & term; switching term is an audited action and triggers (idempotent) job for carry-over (e.g. outstanding fee balances remain on ledger).
- Default Nigerian grading scheme seeded: A 70–100 Excellent · B 60–69 Very Good · C 50–59 Credit · D 45–49 Pass · E 40–44 Fair · F 0–39 Fail (tenant-editable; bands must be contiguous 0–100 without overlap; validated).
- Default assessment scheme: CA1 (15) + CA2 (15) + Exam (70) (editable; per class level overrides allowed).
- Archived sessions are read-only.

### Endpoints (`academics.manage` for writes; `academics.read` for reads)
- [x] CRUD sessions/terms (+ `POST /terms/{id}/set-current` **[A]**) · CRUD class levels/arms · CRUD subjects + `PUT /class-levels/{id}/subjects`
- [x] CRUD grading schemes/bands (validate contiguity) · CRUD assessment schemes/components · CRUD domain traits
- [x] `GET/POST/DELETE /calendar/days`, `POST /calendar/import-holidays` · `GET /terms/{id}/school-days` (computes valid attendance days excluding weekends/holidays) — holiday import covers fixed dates only (OI-042)
- [x] `POST /academics/rollover` **[I][A]**: create next session from current (copy class arms, subject mappings, fee structures draft); no student movement here. — fee drafts and carry-over wait for Fees (OI-043)

---

## 4. Students & Guardians (module `Students`)

### Entities
`Student` (admission_no, first/middle/last, preferred_name, gender, date_of_birth, nationality, state_of_origin?, lga?, religion? (optional/sensitive), address, photo_file_id?, status Applicant|Active|Suspended|Withdrawn|Transferred|Graduated, admitted_on, previous_school?, blood_group?, genotype?, **medical_notes (encrypted)**, special_needs_notes (encrypted), current_class_arm_id (denormalized)),
`Guardian` (title, names, relationship, phone E.164, alt_phone?, email?, occupation?, address, is_primary, can_pickup, portal_access, user_id?), `StudentGuardian` (student, guardian, relationship, is_primary_payer, is_emergency_contact, priority),
`Enrolment` (student, session, class_arm, status Active|Promoted|Repeated|Graduated|Withdrawn, start, end), `StudentDocument` (file_id, type, notes), `AdmissionApplication` (public form; status), `StudentNote` (disciplinary/pastoral; restricted), `ImportJob` + `ImportRow`.

### Rules
- Admission number generated atomically per tenant from `policies.adminNoFormat` (user may override if unique; manual numbers validated against format optionally). Unique `(tenant_id, admission_no)`.
- Duplicate detection on create: same normalized name + DOB, or same guardian phone + similar name → returns `409 students.possible_duplicate` with candidates unless `?allowDuplicate=true` **[A]**.
- A student has exactly one **active** enrolment per session. Capacity of arm enforced (soft warning flag, hard if setting says).
- Siblings auto-linked when guardians share phone (suggestion only; confirm via endpoint).
- Photo: image only ≤ 3 MB, resized (max 800px) + thumbnail; EXIF stripped.
- Withdrawal/transfer/graduation: sets status, closes enrolment, freezes new invoicing, keeps history; outstanding fees remain visible. All **[A][E]**.
- Medical/special-needs fields visible only with `students.sensitive.read`.
- Student/guardian erasure is anonymization after retention checks (financial records retained with pseudonymized identity).

### Endpoints
- [x] `POST /students` **[I][A][E:StudentRegistered]** `students.write` (student + guardians + initial enrolment in one transaction; validates plan limit) — possible duplicates refused unless overridden by a SchoolAdmin; plan limit enforced; medical notes encrypted (OI-053, OI-054)
- [x] `GET /students` (q across name/admission no/guardian phone, filters: class arm/level, status, session, gender, hasOutstandingFees; trigram search) `students.read` (scope-filtered) — teacher data scope arrives with Phase 4 (see ADR 0017)
- [x] `GET /students/{id}` (profile with enrolment history, guardians) · `PATCH /students/{id}` **[A]** (If-Match) · `DELETE /students/{id}` soft **[A]** `students.delete` — attendance and fee summary are in §4 summary, not this item
- [x] `POST /students/{id}/photo` — not built: photo processing is OI-044 · documents CRUD (`/students/{id}/documents`, verified StudentDocument files only)
- [x] Guardians: `POST/PATCH/DELETE /students/{id}/guardians`, `GET /guardians/{id}` (with all wards), `POST /guardians/{id}/portal-invite` **[I][A]** — portal invite waits (OI-056)
- [x] Enrolment ops: `POST /students/{id}/transfer-arm` **[A]** · `POST /students/{id}/withdraw|graduate|reinstate` **[A][E]** — new invoicing freeze waits for Fees (OI-058)
- [x] **Bulk promotion**: `POST /promotions/preview` (class arm → proposed outcome per student using result average + rules) · `POST /promotions/commit` **[I][A]** (promote/repeat/graduate in one transaction; idempotent per `(session,class_arm)`) — outcomes come from the caller until results exist (OI-059)
- [x] **CSV/XLSX import**: `GET /students/import/template` · `POST /students/import` (upload via Files → creates `ImportJob`) · `GET /students/import/{jobId}` (row-level validation report, downloadable error CSV) · `POST /students/import/{jobId}/commit` **[I][A]** (all-or-nothing option or skip-errors option). Runs as a job; progress endpoint. — CSV and XLSX (first sheet; OI-060); runs on the hosted worker until Hangfire (OI-061)
- [x] Admissions (feature-flagged): public `POST /public/{slug}/admissions` (CAPTCHA, rate limit) → `AdmissionApplication`; staff review `GET /admissions`, `POST /admissions/{id}/accept` (creates student) / `reject` **[A]** — gated by the plan entitlement `admissions`; CAPTCHA provider waits (OI-062); decisions in ADR 0018
- [ ] `GET /students/{id}/summary` (attendance %, fee balance, latest results) composing via Contracts (parents get a scoped version through `/me/wards`). — not built: depends on Attendance, Fees and Assessment (OI-064)
- [x] Parent-facing: `GET /me/wards` · `GET /me/wards/{studentId}` (limited fields) — scope enforced by guardian link (ADR 0017); `PATCH /me/wards/{id}/guardian` changes the parent's own contact only.
- [x] Notes: `POST/GET /students/{id}/notes` `students.notes.write|read` — the text is encrypted and the audit carries only the category

---

## 5. Staff & Teachers (module `Staff`)

### Entities
`StaffMember` (staff_no, names, gender, dob, phone, email, address, staff_type Teaching|NonTeaching|Admin|Management, job_title, department, employment_type, hire_date, status Active|OnLeave|Resigned|Terminated, qualifications jsonb, emergency_contact, user_id?, photo_file_id?, bank details **encrypted** (optional)),
`StaffDocument`, `TeacherAssignment` (staff, session, class_arm, subject?, is_form_teacher), `StaffLeave` (type, from, to, status, approver) — simple, `StaffAttendance` (date, check_in, check_out, status) — optional feature flag.

### Rules
- Staff number auto-generated per tenant; staff ↔ user link created on invite acceptance.
- A form teacher is unique per class arm per session. A teacher can be assigned many subjects/arms.
- Deactivating staff disables linked user and ends open assignments (with reassign prompt endpoint).

### Endpoints
- [x] CRUD `/staff` **[A]** `staff.read|write` (+ CSV import like students) · `POST /staff/{id}/invite-user` **[I][A]** · `POST /staff/{id}/deactivate|reactivate` **[A]** — invite, deactivate and reactivate built (ADR 0019); CSV import waits (OI-066); deactivation does not re-enable the account (OI-068)
- [x] `GET/PUT /staff/{id}/assignments?sessionId=` **[A]** `staff.assign` · `GET /class-arms/{id}/teachers` · `GET /me/assignments` (teacher's own classes/subjects) — form teacher unique per arm and session
- [ ] Documents upload/list/delete · Leave: `POST /staff/{id}/leave`, `POST /leave/{id}/approve|reject` **[A]** — leave decisions are built; staff documents not built (OI-067)
- [ ] Staff attendance (if enabled): `POST /staff-attendance/check-in|check-out`, admin correction **[A]**, `GET /staff-attendance/report`.

---

## 6. Attendance (module `Attendance`)

### Entities
`AttendanceSession` (class_arm, date, period? (null = daily register), taken_by, taken_at, locked_at?, status Open|Submitted|Locked), `AttendanceRecord` (session, student, status Present|Absent|Late|Excused, arrival_time?, note?, client_id?, client_updated_at?),
unique `(tenant_id, student_id, date, period)`.

### Rules
- Only valid school days (not weekends/holidays/`NonSchoolDay`) unless admin override **[A]**.
- Teacher may mark only assigned arms (form teacher by default; subject teachers if `period` register enabled). `attendance.mark.all` bypasses scope.
- Editing window: same day for teachers; after that requires `attendance.edit.past` (audited with reason). Locked after term close.
- **Offline sync**: bulk endpoint accepts `clientId`, `clientUpdatedAt`; server applies **last-writer-wins by `clientUpdatedAt`** per student/day, returns per-row result (`applied|ignored_newer_exists|rejected{reason}`); idempotent via **[I]**.
- Absent/Late alerts: after session is **Submitted**, emit `StudentAbsent` events (once per student/day; dedupe key) respecting policy + guardian preferences.
- Percentage computation: `present + late` / school days elapsed (configurable if excused counts as present).

### Endpoints
- [x] `GET /attendance/class-arms/{armId}?date=` (register incl. students, existing marks) — served as /attendance/class-arms/{id}?date= (ADR 0020)
- [x] `PUT /attendance/class-arms/{armId}/{date}` **[I][E]** `attendance.mark` (bulk upsert; supports offline payload) · `POST …/submit` **[E]** · `POST …/reopen` **[A]** — path uses {id}; submit and reopen built (ADR 0020)
- [x] `GET /attendance/students/{id}?termId=` (daily list + summary) · `GET /attendance/reports/class-summary` · `/absentees?date=` · `/term-summary?armId=&termId=` · export XLSX `attendance.export` — report paths are under /attendance/class-arms/{id}/… (ADR 0020); notification delivery waits (OI-069)
- [x] Parent scope: `GET /me/wards/{id}/attendance?termId=`

---

## 7. Assessment: Scores, Results & Report Cards (module `Assessment`)

### Entities
`ScoreSheet` (term, class_arm, subject, status Draft|Submitted|Approved|Published, submitted_by/at, approved_by/at), `ScoreEntry` (sheet, student, component, score nullable, absent flag), unique `(tenant, student, subject, term, component)`,
`SubjectResult` (student, term, subject, total, grade, remark, subject_position, class_avg, highest, lowest; **materialized/computed**), `TermResult` (student, term, class_arm, total, average, class_position, out_of, cumulative_avg, promotion_recommendation),
`AffectiveRating`/`PsychomotorRating` (student, term, trait, rating 1–5), `Remark` (student, term, teacher_remark, principal_remark, form_teacher_id), `ReportCard` (student, term, file_id, version, generated_at, published_at, status), `ResultAmendment` (reason, before/after, requested_by, approved_by) **[MC]**.

### Rules
- Score entry validated against component `max_score`; decimals allowed (1 dp); blank ≠ zero (null = not yet entered; `absent` explicit).
- Workflow: Draft (teacher edits) → Submitted (teacher locks) → Approved (HOD/admin with `results.approve`) → **Published** (release to parents with `results.publish`). Reopen only before Published (audited). After Published, changes only via `ResultAmendment` **[MC]** which regenerates affected report cards (new version) and notifies.
- Computation (idempotent, deterministic, runs as a job on Approve and on demand per class): per-subject total = sum(component scores); grade from default/class scheme; subject position with **ties sharing rank** (dense vs competition ranking configurable; default competition: 1,2,2,4); class position by total/average; class average/highest/lowest; term 3 includes cumulative (avg of 3 terms) and promotion recommendation using tenant rule (e.g., pass mark, must pass English & Maths) — configurable rule object.
- Students missing mandatory subject scores are flagged; report generation blocked unless `forceIncomplete`.
- **Fees gate**: if `results.requireFeesCleared` and fee balance > threshold, parent portal hides the card (staff still see it) with message `results.withheld_fees`; admin may override per student **[A]**.
- Report card PDF (QuestPDF): tenant branding, student photo, session/term, attendance summary, subject table (CA components, exam, total, grade, position, class avg), affective/psychomotor grid, remarks, signatures, next term date, fee notice. Two layouts: Primary/Secondary (templated, selectable). Generated in batch by job with progress; stored in Files; re-generation creates a new version.
- Broadsheet export (XLSX) per class/term.

### Endpoints
- [x] `GET /assessment/score-sheets?termId&classArmId&subjectId` (the query uses `classArmId`; scope by `CanEnterScoresAsync`, 404 outside it) ·  · `PUT /assessment/score-sheets/{id}/scores` **[I]** `results.scores.enter` (bulk upsert, supports offline payload `clientUpdatedAt` LWW) · `POST …/submit` **[A]** · `POST …/approve` **[A]** `results.approve` · `POST …/reopen` **[A]**
- [x] `POST /assessment/compute` **[I]** (job recorded; runs inline, OI-100) (term, arm) → job id · `GET /assessment/jobs/{id}`
- [x] `GET /assessment/results/class?termId&classArmId` (broadsheet JSON) · `GET /assessment/results/students/{id}?termId` · [ ] `GET /assessment/results/students/{id}/history` (not built, OI-104) (broadsheet JSON) · `GET /assessment/results/students/{id}?termId` · `GET /assessment/results/students/{id}/history`
- [x] Domains & remarks (split into `/remarks/students/{id}/teacher` and `/principal`, OI-105): `PUT /assessment/ratings/students/{id}?termId` · `PUT /assessment/remarks/students/{id}?termId` (form teacher/principal permissions)
- [x] Report cards: `POST /report-cards/generate` **[I]** (arm|student list) → job · `GET /report-cards?termId&armId` · `GET /report-cards/{id}/download` (short-lived signed URL) · `POST /report-cards/publish` **[I][A][E:ResultsPublished]** `results.publish`
- [x] Amendments: `POST /assessment/amendments` **[A][MC]** · `POST /assessment/amendments/{id}/approve|reject` **[A]**
- [x] Export: `GET /assessment/results/class/export?format=xlsx`
- [x] Parent: `GET /me/wards/{id}/results?termId` · `GET /me/wards/{id}/report-cards` (respect fees gate + published only)

---

## 8. Fees, Invoicing & Payments (module `Fees`)

### Entities
`FeeItem` (name, category: Tuition|PTA|Uniform|Books|Transport|Exam|Other, is_mandatory_default), `FeeStructure` (session, term?, class_level, name, status Draft|Active, applies_to: Day|Boarding|All) + `FeeStructureLine` (fee_item, amount_kobo, is_optional),
`Discount` (name, type Percentage(bps)|Fixed, scope: Student|Sibling|Staff-child|Scholarship, requires_approval) + `StudentDiscount` (student, discount, session/term, approved_by),
`Invoice` (invoice_no, student, session, term, due_date, status Draft|Issued|PartiallyPaid|Paid|Overdue|Void|Cancelled, subtotal_kobo, discount_kobo, total_kobo, paid_kobo, balance_kobo, issued_at) + `InvoiceLine` + `InvoiceAdjustment` (credit/debit note with reason **[A]**),
`PaymentPlan` + `Instalment` (invoice, due_date, amount, status),
`Payment` (receipt_no, student?, payer_guardian?, amount_kobo, method Card|Transfer|VirtualAccount|Cash|POS|Cheque, channel_ref, reference unique, status Pending|Successful|Failed|Reversed, paid_at, recorded_by, gateway_txn_id?, raw jsonb), `PaymentAllocation` (payment, invoice, amount),
`StudentCredit` (wallet balance via ledger), `LedgerEntry` (**append-only**: student, entry_type InvoiceIssued|PaymentApplied|Adjustment|Reversal|CreditApplied, debit/credit kobo, ref_type/ref_id, occurred_at, running_balance via query),
`VirtualAccount` (student/guardian, provider, account_no, bank, status), `GatewayEvent` (provider, event_id unique, type, payload, signature_valid, processed_at, outcome), `UnallocatedPayment` (queue for unmatched transfers), `Refund`/`Reversal` **[MC]**.

### Rules
- Fee structures are versioned per session/term/level; once any invoice is issued from a structure its lines are immutable (create a new version).
- **Invoice generation** (bulk): `POST /invoices/generate` for term + class level/arm/all; applies discounts; skips students already invoiced (natural key) → idempotent; runs as job with progress; emits `InvoiceIssued` (guardian notification, respecting prefs). New students enrolled mid-term get pro-rata or full invoice per policy.
- Invoice numbers `INV/{YY}/{SEQ}` per tenant; receipt numbers `RCT/{YY}/{SEQ}` per tenant, atomic.
- **Money integrity**: `total = Σ lines − discounts ± adjustments`; `paid = Σ allocations`; `balance = total − paid`; all derived values recomputed by domain methods and asserted in tests; DB check constraints (`balance >= 0`, `paid <= total` unless credit). Ledger is the source of truth for student balance; invoice totals must reconcile with ledger (nightly reconciliation job reports drift to platform alert).
- **Allocation**: payment auto-allocated oldest-due-first (or explicit invoice selection); overpayment becomes student credit auto-applied to future invoices.
- **Manual payments** (cash/POS/cheque/transfer evidence) by bursar: `fees.payments.record` **[I][A][E]**; receipt PDF generated; back-dating limited by policy.
- **Reversal/refund** **[MC]**: `fees.payments.reverse` initiator + different approver with `fees.payments.approve`; creates compensating ledger entries (never deletes); notifies.
- **Overdue**: daily job marks Issued/PartiallyPaid → Overdue after due date; optional late fee rule (flat/percent, once or recurring, capped) producing adjustments; reminder schedule configurable (D-3, D0, D+3, D+7, D+14).
- **Instalments**: payment plan splits an invoice; reminders per instalment; default if missed per policy.
- **Gateway abstraction** `IPaymentGateway` (`InitializeAsync`, `VerifyAsync`, `CreateCustomerAsync`, `CreateDedicatedAccountAsync`, `ParseWebhook`) with **Paystack** implementation (Flutterwave later). Config per environment; per-tenant **subaccount/settlement** config so school funds settle to the school's bank account while platform fee/transaction charge is applied (confirm current Paystack subaccount/split semantics from official docs; record assumptions in OPEN_ITEMS).
- **Online payment flow**: `POST /payments/initialize` **[I]** (invoice(s)/amount, payer) → creates `Payment(Pending)` with reference `SH-{slug}-{ulid}` → Paystack initialize (amount in kobo, NGN, metadata tenant/student/invoice ids, callback URL) → returns `authorizationUrl`. Client return page calls `GET /payments/verify/{reference}`.
- **Webhook** `POST /webhooks/paystack` (anonymous but verified): read **raw body**, verify `x-paystack-signature` = HMAC-SHA512(rawBody, secretKey) with constant-time compare; reject invalid (401, log security event); persist `GatewayEvent` (unique on provider+event id; duplicate → 200 no-op); respond 200 quickly, process via outbox/job: **re-verify with provider verify API** before crediting, check amount (kobo), currency, reference, and status; credit exactly once (transactional + unique reference); handle `charge.success`, `transfer` events if used, dedicated-account credits, refunds. Unknown tenant/reference → `UnallocatedPayment` queue (never dropped).
- **Dedicated virtual accounts**: optional per-student (or per-guardian) NUBAN via provider; on credit event, match by account number → student → auto-allocate; mismatched amounts handled by allocation rules; surplus → student credit; unmatched → queue for bursar (`POST /payments/unallocated/{id}/assign` **[I][A]**).
- All payment state transitions audited; webhook payloads stored (redacted) for dispute resolution; **reconciliation job** compares provider settlements/transactions list vs local payments daily and flags gaps.
- Parents can view invoices, pay online, download receipts, see statement; they cannot see other families' data (scope).

### Endpoints
- [x] Fee items & structures CRUD `fees.structures.manage` (+ `POST /fee-structures/{id}/activate|clone`) **[A]** — items, structures (draft, activate, locked once billed); clone not built (OI-095)
- [x] Discounts CRUD · `POST /students/{id}/discounts` **[A]** (approval if `requires_approval` **[MC]**) — discounts and student grants; two-person approval; scope not stored (OI-094)
- [x] `POST /invoices/generate` **[I][A]** `fees.invoices.create` → job · `GET /invoices` (filters: student, arm, term, status, overdue, balance range) · `GET /invoices/{id}` · `POST /invoices/{id}/void` **[A][MC?]** `fees.invoices.void` · `POST /invoices/{id}/adjustments` **[I][A]** · `GET /invoices/{id}/pdf` — inline, idempotent by natural key; job with progress later (OI-087). Invoice list, get, void, adjustments and PDF built; payment plans not built (OI-086)
- [ ] Payment plans: `POST /invoices/{id}/plan` **[A]**
- [x] Payments: `POST /payments/manual` **[I][A][E]** · `POST /payments/initialize` **[I]** · `GET /payments/verify/{reference}` · `GET /payments` · `GET /payments/{id}` · `GET /payments/{id}/receipt` (PDF) · `POST /payments/{id}/reverse-request` / `…/reverse-approve` **[A][MC]** — manual receipts, initialize, provider verify, list, get and receipt PDF; reversal request and approval; virtual accounts not built (OI-085)
- [x] `POST /webhooks/paystack` (see above) · `GET/POST /payments/unallocated…` — signature over the raw body, each event once, provider re-verify before credit, unallocated queue (OI-084 for provider shapes)
- [x] Student finance: `GET /students/{id}/ledger` · `GET /students/{id}/statement?termId|from|to` (PDF + JSON) · `POST /students/{id}/virtual-account` **[I][A]** — ledger built; statement PDF/JSON and virtual account not built (OI-085)
- [x] Reports (`fees.reports.read`, XLSX export): collection summary (by day/method/class), **debtors/aging** (0–30/31–60/61–90/90+), outstanding by class, discount utilization, reconciliation report, cashier/daily close report (`POST /payments/daily-close` **[A]** locks the day's manual receipts). — collection (by method, reconciled to the ledger), debtor aging and reconciliation built; daily close not built (OI-092)
- [x] Parent: `GET /me/wards/{id}/invoices` · `GET /me/wards/{id}/statement` · `POST /me/payments/initialize` **[I]** (pay for own wards only) — ward invoices and own payments built; statement not built
- [x] Jobs: invoice-generation, overdue marker, reminder dispatcher, reconciliation, ledger-vs-invoice drift check. — overdue sweep built; reconciliation and reminders scheduled later (OI-090, OI-086)

---

## 9. Notifications & Announcements (module `Notifications`)

### Entities
`NotificationTemplate` (key, channel, locale, subject?, body with `{{placeholders}}`, is_system, tenant override), `NotificationPreference` (guardian/user, channel, category, enabled), `Consent` link,
`NotificationMessage` (tenant, recipient (user/guardian/phone/email), channel, category, template_key, payload, status Queued|Sending|Sent|Delivered|Failed|Suppressed, provider, provider_message_id, attempts, error, dedupe_key unique, scheduled_for, sent_at, cost_units),
`Announcement` (title, body, audience {all|levels|arms|staff|custom list}, channels, scheduled_for, status, created_by), `SmsWallet` (tenant balance units) + `SmsLedger`, `Device`/`WebPushSubscription` (optional), `InAppNotification`.

### Rules
- Categories: `Transactional` (OTP, receipts) · `Fees` · `Attendance` · `Results` · `Announcements` · `Emergency`. Guardians can opt out of non-essential categories/channels; **Transactional & Emergency cannot be disabled**. STOP keyword handling for SMS where provider supports it.
- Channels via adapters behind `INotificationChannel`: **SMS** (Termii primary; Africa's Talking fallback), **WhatsApp** (Cloud API; template messages only outside 24h window; templates must be pre-approved — maintain mapping), **Email** (SMTP/Resend/SES), **In-app**. Provider failover on repeated failure; circuit breaker + retry with exponential backoff (Polly resilience pipelines).
- Pipeline: domain event → outbox → `NotificationPlanner` (resolve recipients, preferences, language, quiet hours, dedupe key `category:entity:recipient:date`) → `NotificationMessage(Queued)` → sender job (batching, provider rate limits) → delivery webhook/status poll updates status.
- **Quiet hours** (default 21:00–06:00 WAT): non-urgent messages are scheduled to next window; Emergency and OTP bypass.
- **SMS wallet**: reserve units on queue, deduct on send, refund on failure; low-balance alert to SchoolAdmin; plan monthly credits; platform can top up **[A]**. Message length/segment calculator (GSM-7/UCS-2).
- Templates seeded for: OTP, invite, password reset, invoice issued, fee reminder (pre/post due), payment receipt, payment failed, absence alert, late alert, results published, announcement, term resumption, account locked/security alert.
- Delivery receipts webhook endpoints per provider (verified), idempotent.
- Phone normalization + invalid-number suppression list; hard bounce → mark guardian phone `suspect`.

### Endpoints
- [x] Templates: `GET /notifications/templates` · `PUT /notifications/templates/{key}` **[A]** `notifications.templates.manage` (preview endpoint with sample data; validate placeholders) — built-in catalogue with school overrides; placeholders checked (ADR 0021)
- [x] Preferences: `GET/PUT /me/notification-preferences` (parent/staff) — Transactional and Emergency locked (422 `notifications.not_optional`)
- [x] Announcements: CRUD + `POST /announcements/{id}/send` **[I][A][E]** `announcements.send` (audience preview with recipient count + SMS cost estimate before send; scheduled sends; cancel before dispatch) — audience preview before send; scheduled send; cancel while queued. Web push not built (OI-077)
- [x] `GET /notifications/messages` (admin log with filters/status) · `POST /notifications/messages/{id}/retry` **[A]** · `GET /notifications/stats` — log masks addresses; retry requeues failed messages; stats return success rate
- [x] Wallet: `GET /notifications/sms-wallet` · platform top-up `POST /platform/tenants/{id}/sms-credits` **[A]** — balance, reserved, ledger; platform top-up is authorised and tested, its success path awaits MFA test support (OI-076)
- [x] In-app: `GET /me/notifications` · `POST /me/notifications/{id}/read` · `POST /me/notifications/read-all` · optional web-push subscribe/unsubscribe — inbox is per caller; read and read-all. Web push not built (OI-077)
- [x] Webhooks: `POST /webhooks/sms/{provider}` · `POST /webhooks/whatsapp` (verify token + signature) · `POST /webhooks/email/{provider}` — token-checked SMS and email callbacks; WhatsApp signature over the raw body; each report recorded once (OI-072 for SMS callback shapes)
- [x] Event consumers: StudentRegistered (welcome/portal invite) · InvoiceIssued · PaymentReceived · InvoiceOverdue/Reminders · StudentAbsent/Late · ResultsPublished · AnnouncementSent · TenantStatusChanged (platform notices). — absence alerts and welcome notices built. Invoice, payment, results and tenant-status consumers come with Phases 7–9

---

## 10. Files (module `Files`)

- [x] `POST /files/presign-upload` (purpose enum, content type, size; validates against purpose rules; returns URL + file id) → `POST /files/{id}/complete` (server verifies object exists, size, magic bytes/MIME, optional AV scan hook; image processing job) **[I]** — photos wait for processing (OI-044); quota is per school (OI-046); S3 adapter wait (OI-045); verification by magic bytes (ADR 0016)
- [x] `GET /files/{id}/download-url` (short-lived signed GET, authorization by owning entity scope) · `DELETE /files/{id}` (soft, job removes later) — served through the API session, not signed links (OI-045)
- [x] Purposes: StudentPhoto, StudentDocument, StaffDocument, SchoolLogo, ReportCard, Receipt, ImportUpload, Export. Limits per purpose (e.g., photo 3 MB, docs 10 MB, imports 10 MB). Quarantine until verified. Per-tenant storage quota by plan. — purposes built; StudentPhoto disabled until OI-044

---

## 11. Reporting & Dashboards (module `Reporting`)

- [ ] `GET /dashboard/admin` (enrolment by level/gender, active/withdrawn, today's attendance %, fees billed vs collected this term, top debtors count, results submission progress by class, notifications delivery rate, staff on leave) — cached 60s per tenant. *(Phase 9: built for enrolment, term fees and results progress; the other panels are OI-123)*
- [ ] `GET /dashboard/bursar` · `GET /dashboard/teacher` (my classes, pending score sheets, today's registers not taken) · `GET /dashboard/parent` (wards snapshot: fees due, attendance, latest results, announcements) *(Phase 9: not built, OI-123)*
- [ ] Standard exports (XLSX/CSV/PDF): student list, class list, guardians contact list, attendance, fee reports, results broadsheet. Exports run as jobs for large sets; downloads via Files. *(Phase 9: not built; the school export is in §12)*

---

## 12. Audit & Compliance (module `Audit`)

- [x] `GET /audit-logs` cursor-paged; filters: actor, action, entity, date range, outcome, correlation id `audit.read`; `GET /audit-logs/{id}`; `POST /audit-logs/export` **[A]** (job)
- [ ] `GET /compliance/consents` · `POST /compliance/data-requests` (export/erase a data subject) **[I][A]** with approval workflow **[MC]** · tenant data export `POST /compliance/tenant-export` **[I][A]** (SchoolAdmin; job; zip of CSV + files manifest) *(Phase 9: consents, data requests with maker–checker, and the school export are built; the export holds file metadata, not file bytes (OI-127), and the consent list needs a subject (`subjectType`, `subjectId`))*
- [x] Retention jobs: purge expired idempotency keys, OTP challenges, refresh tokens, processed outbox rows, expired exports; anonymize erased subjects. *(Phase 9: every listed category is purged, and erased subjects are anonymized)*

---

## 13. Background Jobs (Hangfire) — all idempotent, tenant-scoped

Outbox dispatcher (every 5s) · Notification sender (continuous) · Overdue marker (daily 01:00 WAT) · Fee reminders (daily 08:00 WAT) · Absence alert dispatcher · Invoice generation / Score computation / Report-card generation / Import commit / Export (on-demand with progress) ·
Subscription billing & dunning (daily) · Payment reconciliation (daily) · Ledger drift check (nightly) · Cleanup/retention (nightly) · Partition maintenance for `audit_logs` (monthly) · SMS wallet low-balance check (hourly) · Key rotation reminder.
Each job: logs start/end with tenant, has timeout + retry policy, records `job_runs` (name, tenant, status, duration, error), and surfaces failures as metrics.

---

## §P. Permission catalog & default role matrix (seed)

Naming: `area.resource.action`. (✓ = granted by default; Admin = all tenant permissions.)

| Permission | Admin | Registrar | Bursar | Teacher | FormTeacher | Parent | Student |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| students.read / students.write | ✓ | ✓ | read | scoped read | scoped read | — | — |
| students.sensitive.read | ✓ | ✓ | — | — | ✓ | — | — |
| students.delete, promotions.manage | ✓ | ✓ | — | — | — | — | — |
| staff.read / staff.write / staff.assign | ✓ | read | — | — | — | — | — |
| academics.read / academics.manage | ✓ | read | read | read | read | — | — |
| attendance.mark (scoped) | ✓ | ✓ | — | ✓ | ✓ | — | — |
| attendance.mark.all / attendance.edit.past / attendance.export | ✓ | export | — | — | — | — | — |
| results.scores.enter (scoped) | ✓ | — | — | ✓ | ✓ | — | — |
| results.approve / results.publish / results.amend.request / results.amend.approve | ✓ | — | — | — | approve* | — | — |
| fees.structures.manage / fees.invoices.create / fees.invoices.void | ✓ | — | ✓ | — | — | — | — |
| fees.payments.record / fees.payments.reverse | ✓ | — | ✓ | — | — | — | — |
| fees.payments.approve (reversal approver; must differ from initiator) | ✓ | — | — | — | — | — | — |
| fees.reports.read | ✓ | — | ✓ | — | — | — | — |
| notifications.templates.manage / announcements.send | ✓ | ✓ | fees only | — | class only | — | — |
| settings.manage / users.invite / users.manage / roles.manage / roles.assign | ✓ | — | — | — | — | — | — |
| audit.read / compliance.manage | ✓ | — | — | — | — | — | — |
| me.* (own profile, wards, pay, notifications) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

\* FormTeacher approval limited to own arm if tenant policy `results.formTeacherApproves` is true.
Platform catalog: `platform.tenants.*`, `platform.plans.*`, `platform.billing.*`, `platform.audit.read`, `platform.support.access`, `platform.metrics.read`, `platform.sms.topup`.

## §E. Integration events (Contracts) — versioned, additive-only

`TenantCreated`, `TenantStatusChanged`, `UserInvited`, `StudentRegistered`, `StudentStatusChanged`, `EnrolmentChanged`, `GuardianPortalInvited`, `AttendanceSubmitted`, `StudentAbsent`, `ScoreSheetApproved`,
`ResultsComputed`, `ResultsPublished`, `ReportCardGenerated`, `InvoiceIssued`, `InvoiceOverdue`, `PaymentReceived`, `PaymentReversed`, `UnallocatedPaymentReceived`, `AnnouncementSent`, `NotificationDelivered`, `SubscriptionPastDue`.