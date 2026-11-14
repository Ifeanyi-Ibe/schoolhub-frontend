import { defineConfig, devices } from "@playwright/test";
import { e2e } from "./e2e-real/support/env";

// Journeys against the REAL SchoolHub backend (development seed, docs/backend/DEV_SEED.md).
// Credentials and hosts come from .env.e2e (git-ignored). The backend must be running with the BFF
// key in .env.e2e. Seeded accounts are only signed in to; no test changes their passwords.
const baseURL = `http://${e2e.schoolSlug}.localhost:${e2e.port}`;

export default defineConfig({
  testDir: "e2e-real",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${e2e.port}`,
    url: `http://127.0.0.1:${e2e.port}/api/bff/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      API_BASE_URL: e2e.apiBaseUrl,
      BFF_API_KEY: e2e.bffKey,
      APP_BASE_DOMAIN: "localhost",
      APP_ORIGIN: baseURL,
      REFRESH_GRACE_SECONDS: "10",
      DOWNLOAD_ALLOWED_HOSTS: "",
    },
  },
});
