// F1 journeys against the real backend (development seed). Data and accounts come from the seed
// document through .env.e2e; nothing here depends on today's date.
import { test, expect } from "../e2e/fixtures";
import { type Page } from "@playwright/test";
import { e2e } from "./support/env";
import { latestOtpCode } from "./support/otp";
import { platformLogin, platformVerify } from "./support/platform";
import { freshTotp } from "./support/totp";

// The backend allows 10 auth calls per minute per address and 3 OTP requests per phone every 10
// minutes. Journeys run one at a time with a pause; no limit is worked around in the BFF.
test.beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 13_000));
});

async function signInAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/Email or phone/).fill(e2e.adminIdentifier);
  await page.getByLabel(/^Password/).fill(e2e.adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/home");
}

test("the school's name comes from the backend's public branding", async ({ page, request }) => {
  const res = await request.get(
    `${e2e.apiBaseUrl}/api/v1/public/tenants/${e2e.schoolSlug}/branding`,
    {
      headers: { "X-Bff-Key": e2e.bffKey, "X-Tenant": e2e.schoolSlug },
    },
  );
  const name = ((await res.json()) as { name: string }).name;
  await page.goto("/login");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
});

test("a wrong password reads the same as the backend's uniform error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/Email or phone/).fill(e2e.adminIdentifier);
  await page.getByLabel(/^Password/).fill(`${e2e.adminPassword}-wrong`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("could not sign you in");
});

test("admin sign-in reaches home; the session cookies are httpOnly and invisible to page script", async ({
  page,
  context,
}) => {
  await signInAdmin(page);
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
  const at = (await context.cookies()).find((c) => c.name === "sh_at");
  expect(at?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/sh_at|sh_rt/);
});

test("phone-code sign-in for the seeded parent, reading the code from the Development messages endpoint", async ({
  page,
  request,
}) => {
  await page.goto("/login/otp");
  await page.getByLabel("Phone number").fill(e2e.parentPhone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  await page.getByLabel("6-digit code").fill(await latestOtpCode(request, e2e.parentPhone));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("an unknown school is not found, and no session cookie is sent to it", async ({
  page,
  context,
}) => {
  await signInAdmin(page);
  const other = `http://nosuchschool.localhost:${e2e.port}`;
  await page.goto(`${other}/home`);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "School not found" })).toBeVisible();
  expect((await context.cookies(other)).some((c) => c.name.startsWith("sh_"))).toBe(false);
});

test("sign-out revokes the session on the server: the old refresh token is then refused", async ({
  page,
  context,
  request,
}) => {
  await signInAdmin(page);
  const rt = (await context.cookies()).find((c) => c.name === "sh_rt")?.value ?? "";
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  const res = await request.post(`${e2e.apiBaseUrl}/api/v1/auth/refresh`, {
    headers: {
      "X-Bff-Key": e2e.bffKey,
      "X-Tenant": e2e.schoolSlug,
      "Content-Type": "application/json",
    },
    data: { refreshToken: rt },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(401);
});

test("concurrent requests share one refresh (in-process single flight)", async ({
  page,
  context,
  request,
}) => {
  await signInAdmin(page);
  const rt = (await context.cookies()).find((c) => c.name === "sh_rt")?.value ?? "";
  const headers = {
    host: `${e2e.schoolSlug}.localhost:${e2e.port}`,
    cookie: `sh_at=stale-not-a-jwt; sh_rt=${rt}`,
  };
  const [a, b] = await Promise.all([
    request.get(`http://127.0.0.1:${e2e.port}/api/bff/api/v1/me`, {
      headers,
      failOnStatusCode: false,
    }),
    request.get(`http://127.0.0.1:${e2e.port}/api/bff/api/v1/me/tenant`, {
      headers,
      failOnStatusCode: false,
    }),
  ]);
  expect(a.status()).toBe(200);
  expect(b.status()).toBe(200);
});

test("the backend refuses a second concurrent refresh with the documented 409", async ({
  request,
}) => {
  const h = {
    "X-Bff-Key": e2e.bffKey,
    "X-Tenant": e2e.schoolSlug,
    "Content-Type": "application/json",
  };
  const login = await request.post(`${e2e.apiBaseUrl}/api/v1/auth/login`, {
    headers: h,
    data: { identifier: e2e.adminIdentifier, password: e2e.adminPassword },
  });
  const rt = ((await login.json()) as { refreshToken: string }).refreshToken;
  const [a, b] = await Promise.all([
    request.post(`${e2e.apiBaseUrl}/api/v1/auth/refresh`, {
      headers: h,
      data: { refreshToken: rt },
      failOnStatusCode: false,
    }),
    request.post(`${e2e.apiBaseUrl}/api/v1/auth/refresh`, {
      headers: h,
      data: { refreshToken: rt },
      failOnStatusCode: false,
    }),
  ]);
  expect([a.status(), b.status()].sort()).toEqual([200, 409]);
  const loser = a.status() === 409 ? a : b;
  expect(loser.headers()["retry-after"]).toBe("1");
  expect(((await loser.json()) as { code: string }).code).toBe("auth.refresh_in_flight");
});

test("the sessions page loads", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/sessions");
  await expect(page.getByRole("heading", { name: "Devices and sessions" })).toBeVisible();
});

test("platform developer: TOTP sign-in with a fresh code; the same code is then refused (replay)", async ({
  request,
}) => {
  const secret = e2e.platformTotpSecret;
  // First use: a fresh code for the current step.
  const first = await platformLogin(request);
  expect(first.status).toBe(200);
  expect(first.body.mfaRequired).toBe(true);
  const code = await freshTotp(secret);
  const ok = await platformVerify(request, first.body.mfaToken!, code);
  expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  expect(ok.body.accessToken).toBeTruthy();
  // Replay: the same code, a new challenge. The backend must refuse it.
  const second = await platformLogin(request);
  const replay = await platformVerify(request, second.body.mfaToken!, code);
  expect(replay.status).toBe(401);
});
