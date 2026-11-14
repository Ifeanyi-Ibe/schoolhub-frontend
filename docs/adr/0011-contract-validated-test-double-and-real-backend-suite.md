# ADR 0011: Contract-validated test double and the real-backend suite

Status: accepted (F1 fixes, 2026-11-14).

## Context

The browser journeys ran against a test double that accepted any request. A journey could pass against a request the real API would refuse: a missing `Idempotency-Key`, a wrong content type, a body the schema rejects. The real-backend suite covered only what the seed can show, so the blocked journeys stayed blocked.

## Decisions

1. **The test double validates every `/api` request against `docs/openapi/v1.json`** (`e2e/contract.ts`, ajv 2020-12, formats not asserted). It checks that the operation exists, that required query and header parameters are present, that the content type is declared, that the body matches the declared schema, and that `Idempotency-Key` and `If-Match` appear only where declared. A mismatch is recorded and fails the run in the global teardown.
2. **Known gap in the double:** `/api/v1/dev/messages/latest` is not in the spec, so it is not validated. It is used only by the real-backend suite.
3. **The real-backend suite (`npm run test:real`) runs against a backend started from its repository, with the development seed.** It is documented in `docs/TESTING.md` and runs nightly in `.github/workflows/real-backend.yml`, separate from pull-request CI. The workflow has not run on GitHub yet.
4. **Setup and checks call the backend directly with the BFF key; journeys use the BFF.** Creating a school, inviting a spare account, unlocking, suspending and enrolling MFA are setup, and each is an operation in the spec. Sign-in, password change, invitation acceptance and reset run through the BFF and the pages.
5. **The seeded school is never changed by a journey.** The suspended-school read-only check waits for the seed's dedicated suspended school; until then that journey is skipped. (An earlier version suspended and reactivated the seeded school; it was removed.)
6. **Each run creates unique, non-real data, named with an `e2e-` prefix.** The nightly job recreates the backend's database from empty volumes before each run.
7. **HTTPS run.** `scripts/e2e-https.mjs` runs the Chromium journeys over HTTPS with a throwaway self-signed certificate and a TLS proxy, so the `__Host-` cookie names are exercised end to end. `mkcert` was not used because it installs a certificate authority into the system trust store.

## Consequences

- A test that sends a request the contract does not allow fails, which is the intent. Tests must send contract-valid bodies.
- The real-backend suite depends on the backend's rate limits being relaxed (`E2E__RelaxLimits=true`). Without them, the sign-in journeys are paced at 13 seconds each.
