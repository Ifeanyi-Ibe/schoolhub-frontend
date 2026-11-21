# 0016: Staff (F4): records, assignments, leave and invitations

- **Status:** Accepted, 2026-11-21.

## Context

F4 adds the staff records: the list, the profile, create and edit, deactivate and reactivate, invitations, class and
subject assignments per session, the teacher's own classes, and leave. The contract declares the operations. The open
questions were which writes carry a concurrency token or an idempotency key, how a pending leave request is told from a
decided one, and where the assignment rules are enforced.

## Decisions

1. **Only declared headers are sent.** The staff update's summary says it takes `If-Match`, but no header is declared
   (BACKEND_GAPS B-34). The writes follow `writePolicyHeaders`, which reads the declared parameters, so none is sent.
2. **Double submits are guarded in the screen, not the API.** No staff write declares `Idempotency-Key` (B-35). Each
   save and action disables its button while the request is pending. A retry after a dropped connection is not made
   automatically.
3. **A leave request is pending until `decidedAt` is set.** The status text is not used (B-36). Approve and reject
   appear only on pending requests, and only for the assign permission.
4. **Assignments are saved as the whole session's rows.** The contract replaces the rows for a session. The panel
   checks the rules it can see (one form teacher per class arm, no repeated class and subject) before sending. The API
   checks the form-teacher rule across the whole session and answers 409, and the screen shows the code.
5. **Deactivate and reactivate are both offered.** The contract does not say which status each sets (B-36), so the
   screen does not guess which one applies. Deactivation asks first. Nothing changes on screen until the API answers.
6. **Names come from the academic setup.** Assignments and "My classes" show arm and subject names looked up with
   `academics.read` (B-37). Without that permission the text falls back to a generic name.
7. **Staff screens load only what the screen needs.** The record's tabs (assignments, leave) and dialogs (edit,
   invite, deactivate) load when first opened. The overview and its buttons are in the server-rendered page
   (ADR 0014). The deactivate confirmation is separate so the buttons do not pull in the dialog.
8. **Permissions decide what is shown.** Read from `GET /me`: `staff.read`, `staff.write`, `staff.assign`,
   `users.manage`, `users.invite`. Never a role name.

## Consequences

- The record's route-specific JavaScript is 26,798 B gzipped (cap 40,960 B). The shared admin shell grew with the two
  new navigation items; the ratchet was re-baselined for that growth.
- `POST /api/v1/staff` declares a 409. The screen shows any refusal with its code and does not check for duplicates
  itself; what the 409 means is not stated in the contract.
- Staff documents and staff attendance are out of scope (`docs/backend/FEATURE_SPEC.md`, section 5: OI-067 and the
  optional attendance module).
