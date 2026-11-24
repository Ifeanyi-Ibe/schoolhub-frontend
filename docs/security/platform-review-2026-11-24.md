# Security review: the platform sign-in design (ADR 0027), 2026-11-24

- **Reviewer:** the engineering assistant, on the user's authority (2026-11-24). This is a review of the design and of the code it
  would touch. It is not an external penetration test.
- **Scope:** the BFF's auth routes (`src/server/auth-routes.ts`), session cookies (`src/server/session.ts`), the request guards
  (`src/server/request-guards.ts`), the school proxy (`src/server/bff-proxy.ts`), the headers and CSP (`src/proxy.ts`), logging
  (`src/server/log.ts`), tenant resolution (`src/server/tenant.ts`), and the platform operations in `docs/openapi/v1.json`.

## What was checked, and what holds

- **Cookies.** Session cookies are httpOnly, SameSite=Lax, and Secure with the `__Host-` prefix over HTTPS. Clearing is done on
  logout and on a genuine auth failure.
- **CSRF and origin.** Every mutating BFF request must carry the custom header, an Origin equal to the app origin, and must not be
  marked cross-site. The same guard can be used for the platform.
- **Headers.** A per-request nonce CSP with `frame-ancestors 'none'`, `connect-src 'self'`, and a strict `script-src`.
- **Logging.** The logger redacts any key whose name matches token, password, authorization, cookie, key, OTP or secret.
- **Tenancy.** `platform` is a reserved tenant name, so a school host cannot resolve to the platform.
- **Uniform auth errors.** The login path returns the same message for every failure, as CLAUDE.md requires.

## Findings

| #   | Severity | Finding                                                                                                                                                                                                      | Status                                                                                                                                                                         |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | High     | The school proxy attached the school access token to any `api/v1/...` path, including `api/v1/platform/*`. The API is the final gate, but the BFF should never send school credentials to the platform area. | **Fixed** in this review: `validateUpstreamSegments` refuses `platform` segments, with tests (`request-guards.test.ts`).                                                       |
| F2  | Medium   | The platform sign-in must not share the school's cookie names, or a school session could be read as a platform session.                                                                                      | **Condition:** the platform cookies are `sh_p_at`, `sh_p_rt`, `sh_p_mfa`, `sh_p_enr` (with `__Host-` over HTTPS), and no code path reads a school cookie for a platform route. |
| F3  | Medium   | MFA must be enforced before a platform access token is issued. A password step alone must never set the platform access cookie.                                                                              | **Condition:** the platform login issues only an MFA challenge cookie until `mfa/verify` succeeds; an enrollment challenge routes only to enrollment.                          |
| F4  | Medium   | Platform writes (suspend, reactivate, cancel, SMS top-up, billing sweep) need the same CSRF and origin guard as the school's.                                                                                | **Condition:** the platform group calls `checkMutationRequest` with the platform origin.                                                                                       |
| F5  | Medium   | The API must reject a school token on platform routes, and a platform token on school routes. The BFF cannot prove this.                                                                                     | **Ask the backend (B-51):** confirm the platform routes refuse school tokens, and the reverse.                                                                                 |
| F6  | Low      | Platform login errors must stay uniform, as the school login does.                                                                                                                                           | **Condition:** the platform login reuses the uniform-error path.                                                                                                               |
| F7  | Low      | Platform actions are audited by the backend; the screens must not log tokens or tenant personal data.                                                                                                        | **Condition:** the platform screens log nothing beyond the existing redacting logger.                                                                                          |

## Verdict

**Approved with conditions.** The design is sound once F1 (fixed here) and conditions F2 to F4, F6 and F7 are in place, and the
backend confirms F5 (B-51). The platform area is built only with those conditions met, and each condition has a test.

## Decisions

1. Build the platform area in its own BFF group, with its own cookies and guards, as F2 to F4 describe.
2. Do not add the platform's routes to the school's proxy. The school proxy now refuses them (F1).
3. Keep B-51 open until the backend confirms F5; the platform screens can be built and tested against the double while it is open,
   and the real-backend check is the release gate.
