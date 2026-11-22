# 0022: Assessment (F7): score sheets first, then the rest of the phase

- **Status:** Accepted, 2026-11-22. Slice 1 (online score sheets) is in progress; the later slices are planned below.

## Context

F7 covers score entry, computation, broadsheets, domains and remarks, report cards, amendments and the parent's results. The
contract has 34 operations for it, and the backend marks them built (FEATURE_SPEC section 7). That is too much for one
change, so it is split into slices that each pass the gates and can be reviewed on their own.

## Decisions

1. **Slices.** (1) Staff score sheets online: open, enter scores, submit, approve, reopen. (2) Offline score entry with
   last-write-wins sync, as in F5 (`clientUpdatedAt` on each row). (3) Computation job, class broadsheet and export,
   student results, domains and remarks. (4) Report cards: generate job, list, download through the BFF, publish.
   (5) Amendments with maker-checker, and the parent's results and report cards.
2. **Scores are exact.** A score is a string with at most one decimal place (the contract allows decimals, the backend
   validates 1 dp). It is compared with the component's maximum in tenths, never as a float. A blank cell means "not
   entered", not zero. "Absent" is a separate flag, and an absent cell carries no score.
3. **Scores are saved as the server answers.** A save shows the server's counts (applied, ignored, rejected) and the
   reason for each rejected row. Nothing is shown as saved from the screen alone. Each save action carries one
   Idempotency-Key, reused on retry (the contract declares it on the save operation).
4. **Workflow follows the contract.** Draft (teacher edits) → Submitted (teacher locks) → Approved (`results.approve`).
   Reopen needs a reason and `results.approve`. The screen offers only the actions the sheet's status allows; the server
   decides. Publication is not in this slice.
5. **Permissions decide what is shown**, from `GET /me`: `results.scores.enter`, `results.approve`, `results.publish`.
   Never a role name.
6. **Components and maximums** come from the default assessment scheme (`GET /assessment-schemes`), because the sheet
   carries only component ids.
7. **Term, arm and subject** come from the signed-in user's assignments (`GET /me/assignments`) for the current session,
   so a teacher sees only sheets they may enter. The list of terms comes from the session's terms.

## Consequences

- The sheet status is a free string in the contract. The screen labels the values the backend uses (Draft, Submitted,
  Approved, Published) and shows any other value as it arrives, as for fees (B-41).
- Offline score entry (slice 2) will reuse the offline store pattern from F5 (ADR 0017, ADR 0018).
