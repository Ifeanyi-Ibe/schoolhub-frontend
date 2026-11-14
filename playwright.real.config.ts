import { defineConfig, devices } from "@playwright/test";

// Journeys against the REAL SchoolHub backend (development seed, docs/DEV_SEED.md in the backend
// repository). Requires the backend on http://localhost:5152 with the BFF key it was started with,
// passed in REAL_BFF_KEY at run time. Never written to any file. Seeded accounts are only signed in
// to; no test changes their passwords or lockout state.
const key = process.env.REAL_BFF_KEY;
if (!key) throw new Error("Set REAL_BFF_KEY to the BFF key the backend was started with.");
const port = Number(process.env.REAL_PORT ?? 3300);
const baseURL = `http://demo.localhost:${port}`;

export default defineConfig({
  testDir: "e2e-real",
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
    command: `npm run start -- -p ${port}`,
    url: `http://127.0.0.1:${port}/api/bff/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      API_BASE_URL: "http://localhost:5152",
      BFF_API_KEY: key,
      APP_BASE_DOMAIN: "localhost",
      APP_ORIGIN: baseURL,
      REFRESH_GRACE_SECONDS: "10",
      DOWNLOAD_ALLOWED_HOSTS: "",
    },
  },
});
