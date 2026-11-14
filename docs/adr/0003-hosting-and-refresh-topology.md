# ADR 0003: Hosting topology and refresh handling

Status: accepted (F0). Supersedes the single-instance assumption in OI-08 for production scaling.

## Hosting
- **Node runtime, not edge.** The BFF uses Node APIs (streaming responses, fetch with timeouts, crypto). `next.config` sets `output: 'standalone'`.
- Deployment: a container, in the same region as the .NET API, to keep latency for refresh and proxy calls low. The region is OI-09.
- Start with one instance.

## Refresh handling
- The BFF serializes refresh per session inside one process. A refresh result is cached briefly (keyed by the hash of the old refresh token) so a request that arrives just after a rotation reuses the new tokens instead of presenting the already-rotated token.
- Rotation reuse triggers the backend's family revocation (backend CLAUDE.md §8.2). An in-process lock is not enough once there is more than one instance. Across instances, we rely on the backend's 409 grace response for a refresh that is already in flight (`auth.refresh_in_flight`, probed against the running backend; see B-07).
- On that 409 the BFF waits with jittered delay, re-reads the session cookie, and retries a bounded number of times (3). After that it returns 401 and the browser's next request starts over. It never retries a refresh blindly.
- A genuine auth failure clears cookies and redirects to login with a validated same-origin return path.

## Consequences
- Multi-instance scale-out needs no shared lock, but depends on the backend's grace behaviour. If the probe shows no 409 grace, this ADR is revisited before scaling out.
- Reverse proxy must preserve `Host` (used for tenant resolution) and set `X-Forwarded-For`. Inbound `X-Forwarded-*` and `X-Tenant` are stripped by the BFF unless added by our own proxy (count set by `TRUSTED_PROXY_COUNT`).
