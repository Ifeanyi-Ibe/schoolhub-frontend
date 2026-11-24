# 0027: Platform administration and the parent's polish (F8, slices 7 and 9)

- **Status:** Security review done 2026-11-24: approved with conditions. The platform area is built (slice 7) with the conditions met; enrolment is open as B-52. Parent polish is still blocked on budget (decision 5).

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

## Conditions met (2026-11-24)

| Finding | Condition                                                         | Where it is shown                                                        |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| F1      | School proxy refuses platform paths                               | `request-guards.test.ts` (platform path refused)                         |
| F2      | Separate `sh_p_*` cookies, no school cookie read for platform     | `platform-session.test.ts`                                               |
| F3      | MFA before any platform access token; enrolment only to enrolment | `platform-auth.test.ts` (password step never sets access)                |
| F4      | CSRF and origin guard on platform writes                          | `platform-routes.test.ts` (guard refuses without header)                 |
| F5      | Token separation confirmed by the backend                         | B-51, `e2e-real/platform-journeys.spec.ts`                               |
| F6      | Uniform login failures                                            | `platform-routes.test.ts` (uniform message)                              |
| F7      | No token logged; screens log nothing beyond the redacting logger  | the logger's redaction, unchanged; the platform code writes no log lines |

The platform's screens do not use the shared query client, so the platform stays out of the school's budget. A route-group layout was tried and moved the parent budget, so the platform pages render their own frame instead.
