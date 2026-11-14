# Open Items

Decisions and checks. Backend gaps are in `docs/BACKEND_GAPS.md` (B-xx). Decisions recorded in ADRs are marked **Resolved**.

## Decisions

| ID    | Topic               | Status   | Outcome                                                                                                                                                                                                                                                                               |
| ----- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OI-01 | Repo                | Resolved | Own repo, `git init` on `main`. Repo-local author set to the account email; the name "Ifeanyi Ibe" was derived from it. Change with `git config user.name` if needed.                                                                                                                 |
| OI-02 | Domains and API URL | Resolved | Environment-driven: `APP_BASE_DOMAIN` (default `localhost`), `API_BASE_URL`, `BFF_API_KEY`. Production hosts are `{slug}.{APP_BASE_DOMAIN}`. Local dev uses `{slug}.localhost:3000`. Nothing is hardcoded. See `.env.example`.                                                        |
| OI-03 | npm registry        | Resolved | Reachable. An earlier "unavailable" result was a probe error: the `timeout` command is missing on this macOS shell. Versions pinned in F0 (ADR 0004).                                                                                                                                 |
| OI-04 | Hosting             | Resolved | Node runtime, not edge. `output: 'standalone'`. Container in the same region as the API. ADR 0003.                                                                                                                                                                                    |
| OI-05 | Typeface            | Resolved | Inter (body, UI, numerals) and Plus Jakarta Sans (headings). Latin-subset variable fonts through `next/font/local`. `tnum` verified in both files. ADR 0002.                                                                                                                          |
| OI-06 | Platform host       | Open     | Default: same app, `(platform)` route group, separate cookie names.                                                                                                                                                                                                                   |
| OI-07 | Parent PWA          | Open     | Default: one manifest per tenant, served from the school subdomain. The manifest route exists; per-school content waits for B-01.                                                                                                                                                     |
| OI-08 | BFF instances       | Resolved | Single instance initially. Multi-instance refresh uses the backend's 409 grace contract. ADR 0003.                                                                                                                                                                                    |
| OI-09 | API region          | Open     | Name the region the API is deployed in. Needed for the container deployment guide (F9).                                                                                                                                                                                               |
| OI-10 | Minimum browser     | Open     | F0 uses Next's default floor: Chrome and Edge 111+, Firefox 111+, Safari 16.4+. Confirm this against the devices parents actually use. Older Android WebViews are not supported. ADR 0004.                                                                                            |
| OI-11 | App icons           | Open     | `public/icons/*.png` are placeholder brand-colour squares. Provide the school-platform mark (192, 512 and a maskable 512). ADR 0005.                                                                                                                                                  |
| OI-12 | Contract snapshot   | Open     | The live backend spec at `localhost:5152/openapi/v1.json` (225 paths) is newer than `docs/openapi/v1.json` (223 paths). Shall I import it, regenerate the client, and clear B-01, B-04 and B-07 from the frontend's side? Until then the snapshot stays (sha256 in `v1.json.sha256`). |
| OI-13 | Git identity        | Open     | The commits use the account email, with the name "Ifeanyi Ibe" derived from it. Confirm the name, or give the one to use.                                                                                                                                                             |

## Blocked on backend (tracked in BACKEND_GAPS.md)

- F1 waits for the backend's Tier 1 fixes and a regenerated `docs/openapi/v1.json`. Part of this has already landed in the live spec (see the table at the top of BACKEND_GAPS.md).
- Still open in the live spec: typed settings, `If-Match`, camelCase audit params, machine-readable permissions, typed 2xx responses, and the proxy header contract (B-08).

## Verified against the running backend (2026-11-14)

- Error bodies carry `code` and `traceId` at runtime. Checked with an unknown tenant on `POST /api/v1/auth/login` and `POST /api/v1/auth/refresh`, which both return 404 `tenancy.not_found` with `code` and `traceId`. The snapshot's schema was the gap, not the server.
- The live spec documents `auth.refresh_in_flight` (409, `Retry-After`, 10 s grace). The BFF implements that contract. Not reproduced end to end: it needs a real session, and no credentials are in this workspace.

## Still to verify against a running backend

- The `Idempotency-Key` behaviour on the five operations the spec marks but the contract does not (B-06).
- The `url` shape from `GET /files/{id}/download-url` (B-09).
- `POST /auth/otp/verify` returns the same `LoginResponse` shape as password login.
- The withheld-results response shape (B-17).
- A real refresh rotation and the 409 race, with a test account.

## Parked (not in v1 scope unless the backend delivers)

See B-14, B-15 and B-16 in `docs/BACKEND_GAPS.md`.
