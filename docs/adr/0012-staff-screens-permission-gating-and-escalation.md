# ADR 0012: Staff screens: permission gating, the escalation rule on screen, and write headers

Status: accepted (F2, first slice: people and roles, 2026-11-14).

## Context

F2 adds the school's administration screens. Each one needs to show what the user may do, follow the escalation rule (FEATURE_SPEC: a user may assign only roles whose permissions they hold), respect the plan's custom-role feature, and send only the headers the contract declares.

## Decisions

1. **Visibility and actions come from effective permissions in `GET /me`.** Navigation items name a permission, or any one of several (`anyOf`). No screen checks a role name. The school administrator's exception to the escalation rule is therefore decided by the server, not by the screen.
2. **The escalation rule is shown, and the server is still the authority.** A role is offered for assignment only when every permission it holds is one the user holds. A permission the editor does not hold is shown but disabled, with the text "You do not hold this permission". A refusal from the server is shown by its status and code.
3. **Plan gating uses the tenant's entitlements** (`GET /me/tenant`). Custom roles need `customRoles`. Built-in roles stay viewable and become read-only without it.
4. **Writes send only declared headers** (`writePolicyHeaders`, ADR 0006 and BACKEND_GAPS B-05/B-06). Invitations send an `Idempotency-Key` (declared). The key is created once per action, reused on a retry with the same details, and replaced when the details change. Role writes declare neither header, so they are never retried automatically.
5. **List state lives in the URL** (search and page). Filters are shared by link and survive a reload.
6. **Read-only when the school is suspended.** Writes are disabled, and a status message says why (ADR 0009, CLAUDE.md 402 handling).

## Consequences

- Concurrency (`If-Match`) is not used on these screens: no operation declares it (B-05). A "changed by someone else" dialog cannot be built until it does.
- Settings and academic sessions are not built yet (B-03 and B-19).
- A user who holds `roles.assign` but not `roles.manage` sees the roles list, not the editor's save action.
