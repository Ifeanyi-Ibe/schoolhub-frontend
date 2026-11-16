# Testing and gates

Written for: engineers who run or change the test suites. Decisions behind these choices are in `docs/adr/`.

## Gates

| Command             | Runs                                                                       | When                               |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| `npm run gate:fast` | typecheck, lint, format check, unit and component tests, production build  | before **every** commit            |
| `npm run gate`      | fast gate, API drift check, production audit, bundle budgets, Chromium e2e | once per phase and before any push |

Check unpushed history with `git rebase --root -x "npm run gate:fast"`. Any commit that fails is reported.

## Unit and component tests (Vitest)

- `src/**/*.test.{ts,tsx}`, `scripts/**/*.test.mjs` and `e2e/**/*.test.ts` (the request validator).
- Run with `npm test`.

## Browser journeys (Playwright)

- `npm run test:e2e` runs Chromium (desktop and 360px mobile) against the **production build** and the labelled test double (`e2e/fake-api.ts`).
- Every journey uses `e2e/fixtures.ts`, which fails the test on any console error, uncaught page error or CSP violation. The only tolerated errors are the browser's log of a deliberate BFF 4xx, and network errors in the offline journey.
- **The test double validates every request** against `docs/openapi/v1.json` (`e2e/contract.ts`): the operation exists, required query and header parameters are present, the content type is declared, the body matches the declared schema, and `Idempotency-Key` or `If-Match` appear only where the operation declares them. A mismatch is recorded and fails the run in the global teardown. Tests must send contract-valid bodies.
- Known gap: `/api/v1/dev/messages/latest` (the Development message route) is not in the spec, so the double does not validate it.

### HTTPS run (cookies with the `__Host-` prefix)

```sh
npm run test:e2e:https
```

`scripts/e2e-https.mjs` creates a one-day self-signed certificate for `localhost`, `greenfield.localhost` and `demo.localhost` in a temporary directory (it needs `openssl`, which ships with macOS). It starts a small TLS proxy on port 4443 in front of the production server on port 3000, sets `APP_ORIGIN` to the `https` origin, and runs the Chromium desktop journeys. Playwright ignores the certificate error, and Chromium is started with `--ignore-certificate-errors` because service-worker fetches ignore `ignoreHTTPSErrors`. Nothing is installed system-wide, so `mkcert` was not used: it would add a certificate authority to the system trust store.

The run asserts on `__Host-sh_at` and `__Host-sh_rt`, so the prefixed names are exercised end to end.

### Other engines

- `npm run test:e2e:engines` runs WebKit and Firefox on the critical journeys. It is not part of `npm run gate`. The Linux CI job `e2e-engines` (`.github/workflows/ci.yml`) runs it in the official Playwright image.
- **WebKit on macOS cannot run pages here.** Playwright 1.65.1's WebKit build on macOS 14 fails every page in setup with `Protocol error (Page.overrideSetting): Unknown setting: PushAPIEnabled`. Run WebKit in the official image instead:

  ```sh
  npm run build   # on the host, or let the container build it
  docker run --rm --ipc=host \
    --add-host greenfield.localhost:127.0.0.1 --add-host other.localhost:127.0.0.1 \
    -v "$PWD":/src:ro mcr.microsoft.com/playwright:v1.65.1-noble \
    bash -lc 'mkdir -p /work && cd /src && tar --exclude=./node_modules --exclude=./.next --exclude=./.git -cf - . | (cd /work && tar -xf -) && cd /work && npm ci && npm run build && npx playwright test --project=webkit'
  ```

  The copy keeps the host's `node_modules` (macOS binaries) out of the container. `--add-host` lets WebKit resolve the school hosts. The image tag must match the `@playwright/test` version in `package.json`.

- **Firefox (version 159, Playwright 1.65.1):**
  - _Offline navigation._ Playwright's offline mode does not stop a service worker's own network fetches in Firefox. With `context.setOffline(true)` the worker still reached the running server, so `/profile` returned the real page. With the server stopped, Firefox shows the offline page, as Chromium does (checked with the server killed). The offline journey is skipped in Firefox for this reason.
  - _Axe crash (Firefox 159.0, Playwright 1.65.1, `firefox` project)._ Running axe on the sign-in page after the sign-in error is shown kills the Firefox content process (`frame.evaluate: Page crashed`). The sign-in error journey is skipped in Firefox (`e2e/a11y.spec.ts`) and the skip stays.
    - _Measured:_ the committed journey (fields reached by label) crashed 5 of 5 runs. The same steps with fields reached by `input[name]` crashed 2 of 5 runs. So the crash is intermittent, and locator style reduces it without removing it. The name-locator change is not committed.
    - _Minimal repro (temporary spec, removed after use):_ with the page as shipped and only the identifier typed, axe passed 12 of 12 runs. Removing the password field, the submit button, the links, or the main heading, or replacing every input with a bare input, made the form steps fail before axe ran, so those variants do not isolate the trigger. The culprit is not identified. What is known: the crash needs the sign-in form to have text entered and the error alert shown; a bare page, a single input with a script-set value, and a page with its stylesheets disabled did not crash in earlier runs.
    - _Next step:_ a report to the Firefox engine with the page and steps above, and a bisect that changes one element of the error state at a time (the alert, the password field's validity state, the focus after submit).

## Unit test workaround: rejected `vi.fn` in UserRolesDialog

`src/features/staff/UserRolesDialog.test.tsx` stubs `setUserRoles` with a plain function that records calls, not a `vi.fn`. With `vi.fn(...).mockRejectedValue(...)` (or `mockImplementation` returning a rejected promise), Vitest reported the rejected `ApiError` as a failure of the test, although the component caught it and rendered the refusal code. The alert was confirmed rendered (`(code test.refusal_code)`) when the same rejection was logged in the catch. Root cause not found: time-boxed attempt only (lazy rejection, awaited rejection, catch logging). Minimal repro: a `vi.fn` whose implementation returns `Promise.reject(new ApiError(...))`, awaited inside a try/catch in a component. Revisit when Vitest is upgraded.

## Real backend (`npm run test:real`)

These journeys run against the SchoolHub .NET API with its development seed (`docs/backend/DEV_SEED.md`). They are the only tests that exercise the real API, the real rate limits and the real TOTP replay rule.

### Start the backend from the backend repository

```sh
docker compose up -d                 # postgres, seq, minio, mailpit
make migrate                         # the schema must exist first
set -a; . ./.env; set +a             # database connection strings
ASPNETCORE_ENVIRONMENT=Development \
E2E__RelaxLimits=true \
Bff__Keys__0="$(cat /path/to/bff-key.txt)" \
dotnet run --no-launch-profile --project src/SchoolHub.Api --urls http://localhost:5152
```

Then seed it once (idempotent; a second run changes nothing):

```sh
ASPNETCORE_ENVIRONMENT=Development dotnet run --no-launch-profile --project src/SchoolHub.Api -- seed-demo
```

`E2E__RelaxLimits=true` lifts the sign-in, one-time-code and API rate limits for local runs. It is refused in Staging and Production. It does not lift the account lockout, which is a domain rule.

### Configure the frontend

```sh
cp .env.e2e.example .env.e2e    # git-ignored; fill in from the seed doc and the BFF key above
npm run test:real
```

`.env.e2e` holds the BFF key, the seeded credentials and the TOTP secret. Nothing is hardcoded in the tests, and the committed template holds placeholders only.

### Disposable database (nightly)

The nightly job recreates the backend's database for every run: `docker compose down -v` removes the volumes, so the migrations and the seed start from empty. A local run against a database that has accumulated test data is fine, but it is not the nightly guarantee. Test-created data uses names that start with `e2e-` (accounts, schools, roles), so it is easy to find and to remove when a database is kept. There is no tenant-delete API; a disposable database is the cleanup.

The seeded school is never changed by a journey. The suspended-school read-only check waits for the seed's dedicated suspended school, and that journey is skipped until it exists.

### Nightly CI job

`.github/workflows/real-backend.yml` runs the same steps on a schedule. It checks out the backend repository (`BACKEND_REPOSITORY` variable, with the `BACKEND_CHECKOUT_TOKEN` secret if private), starts its compose stack, seeds it, writes `.env.e2e` from repository secrets, and runs `npm run test:real`. It is separate from the pull-request pipeline because it needs Docker and a second repository. This workflow has not run on GitHub yet: it needs the repository variables and secrets set first.
