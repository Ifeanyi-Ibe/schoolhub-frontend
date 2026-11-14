import { defineConfig, devices } from "@playwright/test";
import { TEST_BFF_KEY, FAKE_API_PORT, TENANT } from "./e2e/fake-api";

// e2e runs ONLY against the production build (npm run build runs first in the gate). The
// upstream is the labelled test double in e2e/fake-api.ts, never the real backend.
const port = Number(process.env.E2E_PORT ?? 3000);
// A real school host: {slug}.localhost resolves to loopback in Chromium, and the tenant comes from it.
const baseURL = `http://${TENANT}.localhost:${port}`;

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
    { name: "mobile-360", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${port}`,
    url: `http://127.0.0.1:${port}/api/bff/health`,
    reuseExistingServer: false,
    env: {
      API_BASE_URL: `http://127.0.0.1:${FAKE_API_PORT}`,
      BFF_API_KEY: TEST_BFF_KEY,
      APP_BASE_DOMAIN: "localhost",
      APP_ORIGIN: baseURL,
      DEV_TENANT_SLUG: TENANT,
      DOWNLOAD_ALLOWED_HOSTS: "127.0.0.1",
      REFRESH_GRACE_SECONDS: "10",
    },
    timeout: 120_000,
  },
});
