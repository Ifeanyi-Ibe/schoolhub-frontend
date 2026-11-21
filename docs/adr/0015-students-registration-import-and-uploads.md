# 0015: Students (F3): registration, duplicates, uploads, import and promotions

- **Status:** Accepted, 2026-11-21.

## Context

F3 adds the student records: the list, the profile, registration, guardians, documents, notes, status changes,
bulk import and promotions. The spec declares what each operation accepts. The open questions were: how files
reach storage, which writes need an idempotency key or a concurrency token, and how possible duplicates are
handled.

## Decisions

1. **Uploads go through the BFF, in three steps.** The browser calls `presign-upload` (typed), sends the bytes to
   the `uploadUrl` the API returns (`/api/v1/files/{id}/content`, through `/api/bff`), then calls `complete`
   (typed). The browser never talks to storage (CLAUDE.md). The spec declares no body for the bytes step, so the
   raw PUT is not hand-typed; the test double allows exactly that operation (BACKEND_GAPS B-30). The file's type
   and size are checked against the purpose before anything is sent (`src/features/students/rules.ts`).
2. **Idempotency keys only where declared.** Student registration, the import commit, the promotion commit and the
   fee discount take one `Idempotency-Key` per user action. A retry reuses it. A request that changes (for example
   the duplicate override) gets a new key, because the backend refuses a key reused for a different request
   (`idempotency.key_reuse_mismatch`).
3. **No `If-Match`.** No student operation declares it, so none is sent. The plan's optimistic concurrency for
   student edits cannot be enforced until the backend declares it (BACKEND_GAPS B-31). The screens show the server's
   state after each save.
4. **Possible duplicates stop the registration.** A 409 `students.possible_duplicate` shows the candidate records
   (by id; the backend returns ids only, so names are not shown here). Only a user with
   `students.duplicates.override` may register anyway; the review step then sends a new request with a new key.
5. **Imports are asynchronous.** The job is created (202), polled every two seconds while it is Queued, Validating,
   CommitQueued or Committing, and read when it is Validated, Completed or Failed. Nothing is created before the
   commit. The commit answers 202, so the screen says the commit has started and shows the result when the job
   finishes. Templates and error reports are downloaded through the BFF's download route.
6. **Promotions preview, then commit.** The preview changes nothing. The commit (200) has its own key, reused on a
   retry; a replayed commit is reported as replayed, not as a second promotion.
7. **Staff screens are client-rendered with prefetched data.** Each list and profile reads the signed-in user,
   school and first page on the server (`prefetchSignedIn`). A `Suspense` boundary around the list view made React
   report a hydration mismatch (error #418) on these routes, so the list view is not wrapped in one.

## Consequences

- The raw byte step, the missing `If-Match`, the binary template and error report, and the import job status
  values (free strings in the spec) are recorded in BACKEND_GAPS (B-30, B-31, B-33).
- The class-arm filter and arm names are not shown: the list and profile carry arm ids only (B-32).
- Verified: unit tests for the rules (12); 22 browser journeys at 360 px and desktop with axe; six real-backend
  journeys (registration, duplicate refusal and override, document upload, note and withdrawal, bulk import from
  template to commit, promotion preview).
