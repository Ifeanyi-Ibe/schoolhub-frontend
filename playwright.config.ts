import { defineConfig, devices } from "@playwright/test";
import { TEST_BFF_KEY, FAKE_API_PORT, TENANT } from "./e2e/fake-api";

// e2e runs ONLY against the production build (npm run build runs first in the gate). The
// upstream is the labelled test double in e2e/fake-api.ts, never the real backend.
const port = Number(process.env.E2E_PORT ?? 3000);
// A real school host: {slug}.localhost resolves to loopback in Chromium, and the tenant comes from it.
// E2E_HTTPS=1 runs over HTTPS through scripts/e2e-https.mjs (a TLS proxy in front of the same server).
const https = process.env.E2E_HTTPS === "1";
const httpsPort = Number(process.env.E2E_HTTPS_PORT ?? 4443);
const baseURL = https
  ? `https://${TENANT}.localhost:${httpsPort}`
  : `http://${TENANT}.localhost:${port}`;

// Journeys that every engine must pass: sign-in, the signed-in shell, offline and installability.
const CRITICAL_JOURNEYS =
  /sign-in|a full sign-in|signed-in home|offline|PWA installability|manifest|service worker/;

export default defineConfig({
  testDir: "e2e",
  // Unit tests of the e2e helpers are Vitest files (*.test.ts); only *.spec.ts is a browser journey.
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    // The local HTTPS run uses a throwaway self-signed certificate (scripts/e2e-https.mjs).
    ignoreHTTPSErrors: https,
    // ignoreHTTPSErrors does not reach service-worker fetches, so the HTTPS run also passes the flag.
    ...(https ? { launchOptions: { args: ["--ignore-certificate-errors"] } } : {}),
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile-360", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    // Other engines run the critical journeys only: sign-in, the signed-in shell, offline behaviour
    // and installability. Chromium runs the full set above.
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } },
      grep: CRITICAL_JOURNEYS,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 800 } },
      grep: CRITICAL_JOURNEYS,
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
