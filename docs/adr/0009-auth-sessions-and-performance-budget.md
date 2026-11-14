# ADR 0009: Auth flows, session cookies and browser-bundle decisions (F1)

Status: accepted (F1). Supersedes the cookie-name statement in ADR 0006, item 6.

## Session and cookies

- Tokens are returned by the API to the BFF only. The BFF never sends them to the browser in a body.
- Session cookies: `sh_at` (access) and `sh_rt` (refresh). Challenge cookies: `sh_mfa` (MFA
  step, 5 minutes) and `sh_enr` (mandatory enrolment, 5 minutes). All are `HttpOnly`,
  `SameSite=Lax`, `Path=/`, host-only (no `Domain`), so a school's cookies never reach another
  school's host.
- Over HTTPS the names carry the `__Host-` prefix (`__Host-sh_at` and so on). The browser then
  enforces Secure, Path=/ and no Domain. Over plain HTTP (local development) browsers refuse the
  prefix on a non-secure origin, so the plain names are used. Tests cover both naming schemes.
  Limit: end-to-end tests run over HTTP, so the prefixed names are verified by unit tests only.
- Sign-out, password change and an invalid refresh clear all four cookies.

## Flows (all through `/api/bff/auth/*`, CSRF-checked, strictly validated)

- Sign-in returns a status only: `signed_in`, `mfa_required` or `enrollment_required`.
- MFA verify and enrolment read their challenge from the cookie; the browser never holds it.
  The one-time setup secret and the recovery codes are shown once, and not stored.
- Password change ends every session (backend §8.2), so the cookies are cleared on success.
- Forgot password answers 202 whatever the API says, except rate limits, which are passed on so the
  form can count down.

## Errors and enumeration

- Every credential failure (401, 400, 403) reads the same sentence. Unknown account and wrong password
  are not distinguishable in the UI (asserted in unit and e2e tests).
- 429 is relayed with `Retry-After`; the form disables submit for that long and shows a countdown.
- 402 `billing.suspended` marks the school read-only at the single error boundary (`unwrap`). Every
  write control reads that state, and a banner explains it. The banner's billing link is not shown
  because billing is F8 (BACKEND_GAPS B-14).

## Return paths

- `next` must be a same-origin, app-relative path. Protocol-relative, backslash, scheme, control
  characters, API paths and sign-in loops fall back to `/home`. Tested with 14 cases.

## Tenant

- The school comes from the host. The sign-in layout and the shell read its public branding on the
  server; the colours pass the contrast guard before they are applied (ADR 0008 and the brand guard).

## Offline

- Pages are never cached (they can show a signed-in user's data on a shared phone). A failed
  navigation falls back to the static offline page (ADR 0005). Verified end to end with a route-level
  network failure, because Playwright's offline mode blocks navigation before the worker runs.

## Browser bundle (budget 170 KB gzipped first load, measured on `/login` and `/home`)

- Schema validation stays on the server (Zod). The browser uses React Hook Form's built-in rules.
- `tailwind-merge` is dropped (about 9 KB); `clsx` joins classes, and the one real conflict (input
  border colour) is chosen explicitly.
- Icons are inline SVG (no icon library).
- `next/dynamic` is replaced by `React.lazy` with a null fallback for the toast region, the offline
  banner and the update prompt.
- Messages: one root provider sends the namespaces client components read. A nested provider per
  layout was tried and added a second copy of the runtime (about 6 KB), so it was reverted.
- Measured (last full gate): `/login` 171,542 B gzipped, about 2.5 KB under the line; `/home` (signed-in shell) 162,504 B, about 11.6 KB under the line.

## Consequences

- The sign-in page has about 2.5 KB of margin. Any new client dependency there will fail the gate.
- Adding a feature that needs a schema library in the browser needs this ADR revisited.
