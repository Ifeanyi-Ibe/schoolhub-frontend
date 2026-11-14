import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

// The styleguide is non-production only (404 in production), so its axe checks run against
// `next dev`. The offline page is checked against the production build in the Lighthouse job.
// The BFF integration tests run against a fake upstream API (e2e/fake-api.ts), started in global setup.
const FAKE_API = "http://127.0.0.1:5999";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-360",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    // Always start our own server: a reused one could have other API settings.
    reuseExistingServer: false,
    env: {
      API_BASE_URL: FAKE_API,
      BFF_API_KEY: "e2e-bff-key-0000000001",
      APP_BASE_DOMAIN: "localhost",
      APP_ORIGIN: baseURL,
      DEV_TENANT_SLUG: "greenfield",
      DOWNLOAD_ALLOWED_HOSTS: "127.0.0.1",
    },
    timeout: 120_000,
  },
});
