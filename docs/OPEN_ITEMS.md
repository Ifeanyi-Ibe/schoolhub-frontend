# Open Items

Decisions and checks. Backend gaps are in `docs/BACKEND_GAPS.md` (B-xx). Decisions recorded in ADRs are marked **Resolved**.

## Decisions

| ID | Topic | Status | Outcome |
|---|---|---|---|
| OI-01 | Repo | Resolved | Own repo, `git init` on `main`. Repo-local author set to the account email; the name "Ifeanyi Ibe" was derived from it. Change with `git config user.name` if needed. |
| OI-02 | Domains and API URL | Resolved | Environment-driven: `APP_BASE_DOMAIN` (default `localhost`), `API_BASE_URL`, `BFF_API_KEY`. Production hosts are `{slug}.{APP_BASE_DOMAIN}`. Local dev uses `{slug}.localhost:3000`. Nothing is hardcoded. |
| OI-03 | npm registry | Resolved | Reachable. An earlier "unavailable" result was a probe error: the `timeout` command is missing on this macOS shell. Versions pinned in F0. |
| OI-04 | Hosting | Resolved | Node runtime, not edge. `output: 'standalone'`. Container deployment in the same region as the API (region still to name; see OI-09). ADR 0003. |
| OI-05 | Typeface | Resolved | Inter for body, UI and numerals. Plus Jakarta Sans for headings only. Both Latin-subset variable fonts via `next/font`. ADR 0002. |
| OI-06 | Platform host | Open | Default: same app, `(platform)` route group, separate cookie names. |
| OI-07 | Parent PWA | Open | Default: one manifest per tenant, served from the school subdomain. |
| OI-08 | BFF instances | Resolved | Single instance initially. Multi-instance refresh relies on the backend's 409 grace response, not only an in-process lock. ADR 0003. |
| OI-09 | API region | Open | Name the region the API is deployed in. Needed for the container deployment guide (F9). |

## Blocked on backend (tracked in BACKEND_GAPS.md)
- F1 waits for the backend's Tier 1 fixes and a regenerated `docs/openapi/v1.json`. The current contract hash is recorded in `docs/openapi/v1.json.sha256` at F0.
- Typed responses, `If-Match`, camelCase params, machine-readable permissions and the spec export are in the backend's queue.

## Verify against a running backend
- Whether `code`, `traceId` and `errors` are present in error bodies at runtime. If not, that is a backend bug (per owner direction).
- The refresh-race 409: the exact body and error code, probed against the running backend.
- The `url` shape from `GET /files/{id}/download-url`.
- `POST /auth/otp/verify` returns the same `LoginResponse` shape as password login.
- Withheld-results response shape (B-17).
- Idempotency behaviour on the five operations the spec marks but the contract does not (B-06).

## Parked (not in v1 scope unless the backend delivers)
See B-14, B-15 and B-16 in `docs/BACKEND_GAPS.md`.
