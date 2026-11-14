# ADR 0003: Hosting topology and refresh handling

Status: accepted (F0), updated after the backend's refresh contract was published (live spec, ADR 0008 on the backend). Supersedes the single-instance assumption in OI-08 for production scaling.

## Hosting

- **Node runtime, not edge.** The BFF uses Node APIs (streaming responses, fetch with timeouts, crypto). `next.config.ts` sets `output: 'standalone'`.
- Deployment: a container, in the same region as the .NET API, to keep latency for refresh and proxy calls low. The region is OI-09.
- Start with one instance.

## Refresh handling

Rotation is single-use. Presenting a rotated refresh token after the backend's 10 second grace window is treated as reuse, and the whole session is revoked (`auth.refresh_reuse_detected`). The BFF is built around that.

- **In-process single flight.** One refresh per refresh token runs at a time. Its result is cached for `RESULT_TTL_MS` = 8 s, keyed by the hash of the old token. That keeps every caller inside the backend's 10 s grace window.
- **Across instances, the 409 contract.** While the winning request's successor is unused, the backend answers `409 auth.refresh_in_flight`. The contract says to wait `Retry-After` seconds (default 1), read the session the winner stored, and retry with that newer refresh token. Nothing is revoked on that 409. The BFF does exactly this, with up to 3 retries and 2 newer-token hops.
- **The request's cookie snapshot.** A request holds the cookies it arrived with. If the winner's successor is not visible yet, the BFF keeps waiting and then returns `503` with `Retry-After: 1`. The browser's next request carries the new cookies.
- **Never clear cookies on a 409.** Only a genuine refusal (401 or 403 on refresh) ends the session.
- A genuine auth failure clears cookies and returns 401 with `bff.session_ended`. The login redirect with a validated same-origin return path is an F1 concern.

## Consequences

- Multi-instance scale-out needs no shared lock, because the backend's grace window and the 409 contract cover the race. The in-process cache only removes calls that would otherwise hit the backend.
- The 8 s cache TTL must stay below the backend's grace window (`Auth:RefreshGraceSeconds`, default 10). A test asserts it.
- The in-request cookie snapshot means that a cross-instance race is resolved on the browser's next request, not inside the current one. This costs at most one retry for the user.
- Reverse proxy must preserve `Host` (used for tenant resolution) and set `X-Forwarded-For`. Inbound `X-Forwarded-*` and `X-Tenant` are stripped by the BFF unless added by our own proxy (count set by `TRUSTED_PROXY_COUNT`).
