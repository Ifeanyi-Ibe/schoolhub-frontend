# 0024: Results, report cards, amendments and the parent's results (F7, slices 3 to 5)

- **Status:** Accepted, 2026-11-23. Slices 3 and 4 are built; slice 5 is built for staff (amendments). The parent's results screen is deferred (decision 6).

## Limits

- The broadsheet, the report-card list and the amendment screen keep their own pickers; a shared picker is a follow-up.
- The remark length limit (500 characters) and the rating scale (1 to 5, from the backend spec) are screen-side checks; the contract gives no length limit.

## Context

After score entry (ADR 0022, 0023) the school computes results, reads a class broadsheet, adds domains and remarks, generates
and publishes report cards, amends a published score, and lets parents read their wards' results and report cards. The contract
has 25 operations for these. Three of them answer with binary files (the broadsheet export, the report card PDF), and one
computation runs as a job.

## Decisions

1. **Slices.** Slice 3: computation, broadsheet and export, student results, domains and remarks (staff). Slice 4: report cards
   (generate, list, download, publish). Slice 5: amendments (request, approve, reject) and the parent's results and report cards.
2. **Jobs.** Computation and report generation return a job. The screen polls `GET /assessment/jobs/{id}` every 2 seconds, shows
   `done` of `total`, and stops when the job is finished. The contract leaves `status` as a free string (B-46), so "finished" is
   `total` reached, or a status that reads as completed or failed. A job error is shown as the server's text. The screen does not
   assume a result until the job says so.
3. **Files go through the BFF.** The broadsheet export and report card PDFs use the existing download route (`downloadFromApi`,
   `downloadQueryFromApi`). Ids are in the path or query; no student names are in a URL (CLAUDE.md).
4. **Publishing is confirmed and never optimistic.** Publishing a class shows the server's counts (published, withheld) after the
   answer. Before the answer the screen shows a pending state. A withheld card is listed with `feesWithheld` true, as the contract
   says; the screen shows it as withheld, and never as published.
5. **Amendments are requested on a published result and approved by a second person.** The contract has no list of amendments
   (B-47). The requester is shown the amendment's id and status, and passes the id to the approver, who enters it on the approval
   screen. This is a design-around, and it is the only way to act on an amendment until the contract lists them.
6. **Parents read published results only, and that screen is deferred.** The parent's results and report cards need a term id
   (B-48), and no endpoint a parent can call lists terms. A screen that cannot choose a term would be wrong, so none is built.
   The natural place is a route of its own (`/wards/[id]/results`), server-rendered with the light formatter (ADR 0013). It is not
   added to the wards detail page, which is at its budget cap (173,995 B of 174,080 B), and its strings would ship on every parent route.
7. **Permissions decide what is shown**, from `GET /me`: `results.scores.enter` (read and ratings, remarks by the teacher),
   `results.approve` (compute, generate, principal remark, amendment approval), `results.publish`, `results.amend.request`,
   `results.amend.approve`, and the parent's `me.wards`. Never a role name.
8. **No optimistic writes** for results, cards, publication and amendments (ADR 0019 decision 3 applies to them too).

## Consequences

- An approver must learn an amendment's id from the requester. Until the contract lists amendments, a lost id means a new request.
- The job status vocabulary is unknown to the screen until the backend documents it (B-46).
- Domains and remarks are saved as the teacher enters them, online only: ratings and remarks are not on the offline queue
  (ADR 0023 covers scores only).
