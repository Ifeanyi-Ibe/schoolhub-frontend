# SchoolHub Frontend

Production frontend for a multi-tenant school management system used by private schools in Lagos. A Next.js App Router PWA. The browser talks only to the BFF (`/api/bff/*`), which forwards to the .NET API. Tokens stay in httpOnly cookies.

Status: **F0 (foundation) complete, awaiting review.** See `docs/PROGRESS.md`.

## Quick start

Requirements: Node 22.20.0 (`.nvmrc`), npm.

```sh
npm ci
cp .env.example .env.local   # then set BFF_API_KEY and API_BASE_URL
npm run dev                  # http://localhost:3000 (school host: http://{slug}.localhost:3000)
```

The styleguide is at `/dev/styleguide` (development only; 404 in production).

## Commands

| Command                | What it does                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`          | Dev server (Turbopack). The service worker is off in dev.                           |
| `npm run build`        | Production build (`next build --webpack`, needed for the service worker).           |
| `npm run typecheck`    | `tsc` for the app and the service worker.                                           |
| `npm run lint`         | ESLint, zero warnings.                                                              |
| `npm run format:check` | Prettier check.                                                                     |
| `npm run api:gen`      | Regenerate the typed client and the operation manifest from `docs/openapi/v1.json`. |
| `npm run api:check`    | Fail if generated files or the contract hash are stale (CI drift check).            |
| `npm run test`         | Unit and component tests (Vitest).                                                  |
| `npm run size`         | First-load JavaScript budget (gzipped), against a running production build.         |
| `npm run test:e2e`     | Playwright: axe checks, BFF integration (against a fake API), PWA checks.           |
| `npm run lhci`         | Lighthouse CI (mobile, throttled) against a production build.                       |
| `npm run audit:prod`   | Fail on high-severity production dependency advisories.                             |
| `npm run gate`         | Everything above except Lighthouse. Run before every commit.                        |

## Configuration

Every host, URL and secret comes from the environment. See `.env.example` for the list. `docs/CONFIG.md` (every variable, with defaults and consequences) is written in F9.

## Architecture

- `src/app/` routes. Route groups for `(auth)`, `(staff)`, `(parent)`, `(platform)` arrive with their phases.
- `src/server/` the BFF: environment, tenant resolution, the single API client, refresh, the proxy and download pipeline.
- `src/lib/api/` the typed client surface: generated schema (`schema.d.ts`), operation manifest, ProblemDetails parser, idempotency and `If-Match` policy.
- `src/lib/capabilities.ts` what the contract offers. The UI shows a feature only when its operations exist.
- `src/components/ui/` shared components. `src/lib/theme` and `src/lib/format` for tokens, contrast, kobo and Lagos dates.
- `src/sw/` the service worker (Serwist). `src/proxy.ts` the per-request CSP nonce and security headers.
- `docs/` the plan, the API overview, backend gaps, open items, progress and ADRs.

## Contract

`docs/openapi/v1.json` is the snapshot the client is generated from (hash in `docs/openapi/v1.json.sha256`). Do not hand-write API types. Regenerate with `npm run api:gen` after replacing the snapshot.

## Deployment

Node runtime, a container built from the `standalone` output, in the same region as the API (ADR 0003). The deployment guide is written in F9.
