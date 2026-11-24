# 0027: Platform administration and the parent's polish (F8, slices 7 and 9)

- **Status:** Proposed, 2026-11-24. **Pending security review** for the platform sign-in (CLAUDE.md: a checkpoint for the BFF, cookies and session handling). Not built.

## Context

Slice 7 is the platform area: a separate sign-in with MFA for SchoolHub's own staff, to list and manage tenants, read metrics, run the
billing sweep and top up a school's SMS credits. Slice 9 is the parent's polish: the parent's inbox, dashboard, preferences and results.

## Decisions

1. **Platform sign-in gets its own BFF route group** (`/api/bff/platform/*`), with its own cookies, its own session, and a refresh that never
   shares a session with a school user. A school session must not be able to call a platform route, and the platform cookies are
   httpOnly, Secure and SameSite=Lax, as CLAUDE.md requires for every token.
2. **MFA is mandatory for platform users.** The platform login is a password step followed by `mfa/verify`; a first sign-in routes to
   `mfa/enrollment` and nothing else (the contract's `mfaEnrollmentRequired`).
3. **Platform screens read `GET /platform/...` only through that group**, and every platform write (suspend, reactivate, cancel, SMS
   top-up, billing sweep) shows the server's answer and never a guessed state.
4. **This ADR is not built until the security review approves decisions 1 and 2.** The review is the user's; the platform screens wait for it.
5. **Parent polish waits for budget room.** The parent inbox, dashboard and preferences need the light formatter (ADR 0013) and add to
   every parent route. The parent group is at 173,995 B of its 174,080 B cap, and the cap is not raised to fit a screen (decision made
   earlier with the user). Until the budget is reworked, the parent's inbox, dashboard and results stay out of the parent portal.
6. **Blocked items are recorded, not stubbed**: CLAUDE.md forbids stubs in work marked done, so neither slice is marked done.

## Consequences

- F8 is complete for the staff area (slices 1 to 6 and 8). The platform area and the parent's polish remain open, each for a named reason.

## Decisions (2026-11-24)

- **Platform administration stays unbuilt until the security review approves decisions 1 and 2.** Building the sign-in before review would put untested session handling in front of tenant data. The review is the user's to give.
- **Parent polish stays blocked on budget.** No cap raise. The next step is a separate proposal to split the parent wards detail (the page at the cap), which I can draft once the user agrees to that direction.
