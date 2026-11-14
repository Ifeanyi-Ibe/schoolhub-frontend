// F1 journeys against the production build. Upstream = labelled test double (e2e/fake-api.ts).
import { test, expect } from "./fixtures";
import { COOKIE, OTHER_ORIGIN, SCHOOL_ORIGIN } from "./origin";
import { type BrowserContext, type Page } from "@playwright/test";
import { TEST_PASSWORD } from "./fake-api";
import { LOOPBACK, SCHOOL_HOST } from "./api-host";

async function signIn(page: Page, identifier: string, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel(/Email or phone/).fill(identifier);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const cookieNamed = async (ctx: BrowserContext, name: string) =>
  (await ctx.cookies()).find((c) => c.name === name);

test.describe("sign-in page", () => {
  test("shows the school's own name and brand colour, read on the server", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Greenfield Academy", { exact: true })).toBeVisible();
    // The colour comes from the same-origin /tenant-brand.css stylesheet, so the computed value is the check.
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.querySelector(".tenant-brand") as Element)
            .getPropertyValue("--brand")
            .trim(),
        ),
      )
      .toMatch(/^#[0-9a-f]{6}$/);
  });

  test("a wrong password and an unknown account read exactly the same", async ({ page }) => {
    await signIn(page, "ok@test.invalid", "wrong-password-9999");
    const wrong = await page.locator('p[role="alert"]').textContent();
    await page.goto("/login");
    await signIn(page, "nobody-here@test.invalid", "wrong-password-9999");
    const unknown = await page.locator('p[role="alert"]').textContent();
    expect(wrong).toBe(unknown);
    expect(wrong).toMatch(/could not sign you in/i);
    expect(await page.getByLabel(/^Password/).inputValue()).toBe("");
  });

  test("a rate limit shows a countdown and re-enables submit when it ends", async ({ page }) => {
    await signIn(page, "limited@test.invalid");
    await expect(page.getByText(/Try again in \d+ s/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled({ timeout: 10_000 });
  });

  test("the password is never in the URL and tokens are not reachable from page script", async ({
    page,
    context,
  }) => {
    await signIn(page, "ok@test.invalid");
    await page.waitForURL("**/home");
    expect(page.url()).not.toContain(TEST_PASSWORD);
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toMatch(/sh_at|sh_rt/);
    const at = await cookieNamed(context, COOKIE.at);
    expect(at?.httpOnly).toBe(true);
    expect(at?.sameSite).toBe("Lax");
    expect((await cookieNamed(context, COOKIE.rt))?.httpOnly).toBe(true);
  });
});

test.describe("sign-in steps", () => {
  test("a full sign-in lands on home with the user's name", async ({ page }) => {
    await signIn(page, "ok@test.invalid");
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: /Welcome, Test User/ })).toBeVisible();
  });

  test("MFA: a second step with an authenticator code, then home", async ({ page }) => {
    await signIn(page, "mfa@test.invalid");
    await expect(page).toHaveURL(/\/login\/mfa/);
    await page.getByRole("textbox", { name: /^Code/ }).fill("000000");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("That code did not work. Try again.")).toBeVisible();
    await page.getByRole("textbox", { name: /^Code/ }).fill("123456");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test("mandatory enrolment routes to set-up only; recovery codes are shown once", async ({
    page,
  }) => {
    await signIn(page, "enrol@test.invalid");
    await expect(page).toHaveURL(/\/login\/enroll/);
    await expect(page.getByText("JBSWY3DPEHPK3PXP")).toBeVisible();
    await page.getByLabel("Code from the app").fill("654321");
    await page.getByRole("button", { name: "Finish set up" }).click();
    await expect(page.getByText("AB12-CD34")).toBeVisible();
    await page.getByRole("button", { name: "Continue to SchoolHub" }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test("a phone code signs in", async ({ page }) => {
    await page.goto("/login/otp");
    await page.getByLabel("Phone number").fill("+2348000000000");
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("6-digit code").fill("111222");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test("forgot password gives the same answer for any identifier", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email or phone").fill("nobody-here@test.invalid");
    await page.getByRole("button", { name: "Send instructions" }).click();
    await expect(page.getByText(/If an account exists for that/)).toBeVisible();
  });

  test("an invitation sets a password from the fragment token, which then leaves the address bar", async ({
    page,
  }) => {
    await page.goto("/accept-invite#token=valid-invite-token-0001");
    await page.locator("input[type=password]").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await expect(page.getByText(/Your account is ready/)).toBeVisible();
    expect(page.url()).not.toContain("valid-invite-token");
  });

  test("a reset link keeps its token in the fragment, out of the address bar", async ({ page }) => {
    await page.goto("/reset-password#token=valid-reset-token-0001");
    await expect(page.locator("input[type=password]")).toBeVisible();
    expect(page.url()).not.toContain("valid-reset-token");
    await page.locator("input[type=password]").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText(/Your password has been changed/)).toBeVisible();
  });
});

test.describe("routing and return paths", () => {
  test("a protected page sends a signed-out user to sign-in, then back to that page", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile/);
    await page.getByLabel(/Email or phone/).fill("ok@test.invalid");
    await page.getByLabel(/^Password/).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("an off-site return path is ignored and the user lands on home", async ({ page }) => {
    await page.goto("/login?next=//evil.example/steal");
    await page.getByLabel(/Email or phone/).fill("ok@test.invalid");
    await page.getByLabel(/^Password/).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test("an expired session with a dead refresh token returns the user to sign-in", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: COOKIE.at, value: "stale-not-a-jwt", url: SCHOOL_ORIGIN },
      { name: COOKIE.rt, value: "dead", url: SCHOOL_ORIGIN },
    ]);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a refresh race (409 auth.refresh_in_flight) is waited out, and the page loads", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: COOKIE.at, value: "stale-not-a-jwt", url: SCHOOL_ORIGIN },
      { name: COOKIE.rt, value: "rt:race:1", url: SCHOOL_ORIGIN },
    ]);
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("tenant isolation and read-only state", () => {
  test("cookies from one school do not reach another school's host", async ({ page, context }) => {
    await signIn(page, "ok@test.invalid");
    await page.waitForURL("**/home");
    // A different school on the same base domain: no session cookie is sent there.
    await page.goto(`${OTHER_ORIGIN}/home`);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "School not found" })).toBeVisible();
    expect((await context.cookies(OTHER_ORIGIN)).some((c) => c.name.includes("sh_"))).toBe(false);
  });

  test("a suspended school is read-only: a banner, and writes are disabled", async ({ page }) => {
    await signIn(page, "suspended@test.invalid");
    await page.waitForURL("**/home");
    await expect(page.getByText("Read-only: this school's account is suspended")).toBeVisible();
    await page.goto("/sessions");
    await expect(page.getByRole("button", { name: "Sign out everywhere" })).toBeDisabled();
  });

  test("signing out clears the session cookies and returns to sign-in", async ({
    page,
    context,
  }) => {
    await signIn(page, "ok@test.invalid");
    await page.waitForURL("**/home");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await cookieNamed(context, COOKIE.at)).toBeUndefined();
    expect(await cookieNamed(context, COOKIE.rt)).toBeUndefined();
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login/);
  });

  test("changing the password ends the session everywhere", async ({ page, context }) => {
    await signIn(page, "ok@test.invalid");
    await page.waitForURL("**/home");
    await page.goto("/profile");
    await page.getByLabel("Current password").fill(TEST_PASSWORD);
    await page.getByLabel("New password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page).toHaveURL(/\/login\?signedOut=1/);
    expect(await cookieNamed(context, COOKIE.at)).toBeUndefined();
  });

  test("sessions: revoke another device", async ({ page }) => {
    await signIn(page, "ok@test.invalid");
    await page.waitForURL("**/home");
    await page.goto("/sessions");
    await page.getByRole("button", { name: "Sign out this device" }).click();
    await expect(page.getByText("That device has been signed out.")).toBeVisible();
  });
});

test.describe("headers, browser support and offline", () => {
  test("the sign-in page carries a per-request nonce CSP with no inline script", async ({
    request,
  }) => {
    const res = await request.get(`${LOOPBACK}/login`, { headers: { host: SCHOOL_HOST } });
    const csp = res.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
  });

  test("the styleguide does not exist in production", async ({ request }) => {
    expect(
      (
        await request.get(`${LOOPBACK}/dev/styleguide`, { headers: { host: SCHOOL_HOST } })
      ).status(),
    ).toBe(404);
  });

  test("a browser without the required features is sent to the static unsupported page", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // Simulate a browser that lacks oklch and color-mix.
      const css = (window as unknown as { CSS: { supports: (...a: string[]) => boolean } }).CSS;
      css.supports = () => false;
    });
    await page.goto("/login");
    await expect(page).toHaveURL(/\/unsupported\.html$/);
    await expect(page.getByRole("heading", { name: "Please update your browser" })).toBeVisible();
  });

  test.describe("offline", () => {
    test.use({ allowOfflineNetwork: true });
    test("offline: the shell says so, and a reload shows the offline page", async ({
      page,
      context,
    }) => {
      await signIn(page, "ok@test.invalid");
      await page.waitForURL("**/home");
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await context.setOffline(true);
      await expect(page.getByText("You are offline")).toBeVisible();
      await page.goto("/profile").catch(() => undefined);
      await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
      await context.setOffline(false);
    });
  });
});
