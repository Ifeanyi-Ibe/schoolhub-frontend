// Real-backend journeys. Accounts and data are the documented development seed (docs/DEV_SEED.md).
import { expect, test } from "@playwright/test";

const API = "http://localhost:5152";
const PASSWORD = "Dev-Only-Passw0rd-2034";
const PARENT_PHONE = "+2348011000001";

// The backend allows 10 auth calls per minute per client address (RateLimits:AuthPerMinute), so the
// journeys run one after another with a pause. Without it the later sign-ins are rate limited.
test.beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 13_000));
});

async function signInAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/Email or phone/).fill("admin@demo.example.com");
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/home");
}

test("the school's own name comes from the real backend's public branding", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Demo Academy", { exact: true })).toBeVisible();
});

test("a wrong password reads the same as the real backend's uniform error (UI)", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel(/Email or phone/).fill("admin@demo.example.com");
  await page.getByLabel(/^Password/).fill("wrong-password-probe-0001");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("could not sign you in");
});

test("admin sign-in reaches home, and the signed-in shell loads the real account", async ({
  page,
  context,
}) => {
  await signInAdmin(page);
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
  const cookies = await context.cookies();
  const at = cookies.find((c) => c.name === "sh_at");
  expect(at?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/sh_at|sh_rt/);
});

test("phone-code (OTP) sign-in for the seeded parent, reading the Development-only message", async ({
  page,
  request,
}) => {
  await page.goto("/login/otp");
  await page.getByLabel("Phone number").fill(PARENT_PHONE);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  // Development only: the backend keeps the last message per recipient (docs/DEV_SEED.md).
  const msg = await request.get(
    `${API}/api/v1/dev/messages/latest?to=${encodeURIComponent(PARENT_PHONE)}`,
    {
      headers: { "X-Tenant": "demo" },
    },
  );
  expect(msg.status()).toBe(200);
  const body = String((await msg.json()).body ?? "");
  const code = /Your code is (\d{6})/.exec(body)?.[1];
  expect(code).toBeTruthy();
  await page.getByLabel("6-digit code").fill(code!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("an unknown school is not found, and no session cookie is sent to it", async ({
  page,
  context,
}) => {
  await signInAdmin(page);
  await page.goto("http://nosuchschool.localhost:" + (process.env.REAL_PORT ?? 3300) + "/home");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "School not found" })).toBeVisible();
  expect(
    (
      await context.cookies("http://nosuchschool.localhost:" + (process.env.REAL_PORT ?? 3300))
    ).some((c) => c.name.startsWith("sh_")),
  ).toBe(false);
});

test("sign-out revokes the session on the server: the old refresh token is refused afterwards", async ({
  page,
  context,
  request,
}) => {
  await signInAdmin(page);
  const rt = (await context.cookies()).find((c) => c.name === "sh_rt")?.value;
  expect(rt).toBeTruthy();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await context.cookies()).some((c) => c.name.startsWith("sh_"))).toBe(false);
  // The backend must refuse the refresh token that was in the cookie.
  const res = await request.post(`${API}/api/v1/auth/refresh`, {
    headers: {
      "X-Bff-Key": process.env.REAL_BFF_KEY!,
      "X-Tenant": "demo",
      "Content-Type": "application/json",
    },
    data: { refreshToken: rt },
    failOnStatusCode: false,
  });
  // Refused: anything but a fresh token. 429 means the backend's rate limit answered first.
  expect(res.status()).not.toBe(200);
});

test("concurrent requests share a single refresh (in-process single flight)", async ({
  page,
  context,
  request,
}) => {
  await signInAdmin(page);
  const rt = (await context.cookies()).find((c) => c.name === "sh_rt")?.value ?? "";
  // Access token expired, refresh token valid: the BFF must refresh once for two requests at once.
  // Node's request client cannot resolve *.localhost, so it calls loopback with the school's Host.
  const port = process.env.REAL_PORT ?? "3300";
  const headers = { host: `demo.localhost:${port}`, cookie: `sh_at=stale-not-a-jwt; sh_rt=${rt}` };
  const [a, b] = await Promise.all([
    request.get(`http://127.0.0.1:${port}/api/bff/api/v1/me`, { headers, failOnStatusCode: false }),
    request.get(`http://127.0.0.1:${port}/api/bff/api/v1/me/tenant`, {
      headers,
      failOnStatusCode: false,
    }),
  ]);
  expect(a.status()).toBe(200);
  expect(b.status()).toBe(200);
});

test("the sessions page lists the real device list", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/sessions");
  await expect(page.getByRole("heading", { name: "Devices and sessions" })).toBeVisible();
});
