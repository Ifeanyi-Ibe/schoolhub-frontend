// F1 journeys that need data the seed does not hold: a second school, a suspended school, and a spare
// account this run invites. Setup goes through the backend directly (e2e-real/support/admin.ts); the
// journeys themselves sign in, change passwords and accept invitations through the BFF and the pages.
// Each run creates new, unique, non-real data and restores the one thing it changes (the seeded
// school's status), in a finally block. Nothing here depends on today's date.
import { randomUUID } from "node:crypto";
import { type Page } from "@playwright/test";
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import {
  adminAccessToken,
  createSchool,
  enrolMfa,
  inviteUser,
  latestMessage,
  platformAccessToken,
  runAddress,
  unlockUser,
  userAccessToken,
} from "./support/admin";
import { freshTotp } from "./support/totp";

// Sign-in is rate limited per address, so journeys run one at a time with a pause (see real-backend.spec.ts).

const SCHOOL = `http://${e2e.schoolSlug}.localhost:${e2e.port}`;
const LOOPBACK = `http://127.0.0.1:${e2e.port}`;

/** A password that meets the policy (10+ characters), unique to this run. Never logged. */
const runPassword = (tag: string) => `Run-${tag}-${randomUUID().slice(0, 8)}-pass`;

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/Email or phone/).fill(identifier);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** The token from the newest message to an address. The emailed link carries it as `token=`. */
async function tokenFromMessage(request: import("@playwright/test").APIRequestContext, to: string) {
  const body = await latestMessage(request, to);
  const token = /token=([^\s&"<>]+)/.exec(body)?.[1];
  if (!token) throw new Error("no token in the latest message");
  return token;
}

test.describe("a school the token does not belong to", () => {
  test("a session from one school is refused on another school's host (tenant mismatch)", async ({
    request,
  }) => {
    const platform = await platformAccessToken(request);
    const slug = `e2e-${Date.now().toString(36)}`;
    await createSchool(request, platform, slug);
    const admin = await adminAccessToken(request);

    // The BFF takes the school from the host, so the seeded school's token is sent to the new school.
    const res = await request.get(`${LOOPBACK}/api/bff/api/v1/me`, {
      headers: { host: `${slug}.localhost:${e2e.port}`, cookie: `sh_at=${admin}` },
      failOnStatusCode: false,
    });
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    expect(res.status()).toBe(403);
    expect(body.code).toBe("tenancy.mismatch");
  });
});

// The seeded school is never suspended by a test. The read-only state is checked against the
// dedicated suspended school, which the backend's seed does not hold yet. Until it does, this journey is
// skipped (the browser suite covers the banner and the disabled writes against the test double).
test.describe("a suspended school", () => {
  // Not run: the seed has no dedicated suspended school yet. When it does, sign in to that school's host
  // with its administrator, assert the banner and the disabled writes, and never suspend the seeded school.
  test.skip("a signed-in user of the dedicated suspended school sees the read-only banner", async () =>
    undefined);
});

test.describe.serial("a spare account this run invites", () => {
  const spare = {
    email: runAddress("spare"),
    id: "",
    password: runPassword("first"),
    resetPassword: runPassword("reset"),
    mfaSecret: "",
  };

  test("the administrator invites the account", async ({ request }) => {
    const admin = await adminAccessToken(request);
    spare.id = await inviteUser(request, admin, "E2E Spare", spare.email);
    expect(spare.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("the invitation sets a password; the new account signs in", async ({ page, request }) => {
    const token = await tokenFromMessage(request, spare.email);
    // The page reads the token from the fragment (never sent to the server), so the link is opened that way.
    await page.goto(`/accept-invite#token=${encodeURIComponent(token)}`);
    await page.getByLabel(/^Password/).fill(spare.password);
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await expect(page.getByText("Your account is ready. Sign in to continue.")).toBeVisible();

    await signIn(page, spare.email, spare.password);
    await page.waitForURL("**/home");
  });

  test("five wrong passwords lock the account; the administrator unlocks it", async ({
    page,
    request,
  }) => {
    for (let i = 0; i < 5; i++) {
      await page.goto("/login");
      await page.getByLabel(/Email or phone/).fill(spare.email);
      await page.getByLabel(/^Password/).fill(`${spare.password}-wrong-${i}`);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.locator('p[role="alert"]')).toBeVisible();
    }
    // The next attempt, even with the right password, is refused for the lock.
    await signIn(page, spare.email, spare.password);
    await expect(page.locator('p[role="alert"]')).toContainText("Too many attempts");

    const admin = await adminAccessToken(request);
    await unlockUser(request, admin, spare.id);
    await signIn(page, spare.email, spare.password);
    await page.waitForURL("**/home");
  });

  test("changing the password ends the session everywhere; the old password is then refused", async ({
    page,
  }) => {
    await signIn(page, spare.email, spare.password);
    await page.waitForURL("**/home");
    await page.goto("/profile");
    await page.getByRole("button", { name: "Edit: Change password" }).click();
    await page.getByLabel("Current password").fill(spare.password);
    await page.getByLabel("New password").fill(spare.resetPassword);
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await page.waitForURL("**/login?signedOut=1");
    await expect(page.getByText("You have been signed out.")).toBeVisible();

    await signIn(page, spare.email, spare.password);
    await expect(page.locator('p[role="alert"]')).toContainText("could not sign you in");
  });

  test("a forgotten password is reset from the emailed link, and the new password signs in", async ({
    page,
    request,
  }) => {
    await page.goto("/forgot-password");
    await page.getByLabel(/Email or phone/).fill(spare.email);
    await page.getByRole("button", { name: "Send instructions" }).click();
    await expect(
      page.getByText("If an account exists for that, instructions are on their way."),
    ).toBeVisible();

    const token = await tokenFromMessage(request, spare.email);
    await page.goto(`/reset-password#token=${encodeURIComponent(token)}`);
    await page.getByLabel(/^New password/).fill(spare.resetPassword);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Your password has been changed. Sign in with it.")).toBeVisible();

    await signIn(page, spare.email, spare.resetPassword);
    await page.waitForURL("**/home");
  });

  test("two-step sign-in: the account enrols an authenticator, then signs in with a code", async ({
    page,
    request,
  }) => {
    const first = await userAccessToken(request, spare.email, spare.resetPassword);
    if (!first.body.accessToken) throw new Error(`sign-in before MFA answered ${first.status}`);
    spare.mfaSecret = await enrolMfa(request, first.body.accessToken);

    await signIn(page, spare.email, spare.resetPassword);
    await page.waitForURL(/\/login\/mfa/);
    await page.getByLabel(/^Code/).fill(await freshTotp(spare.mfaSecret));
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/home");
  });
});

test.describe("the invitation email's link", () => {
  // B-18: the backend emits the token in the query string. The page accepts that form as an interim
  // fallback, reads it, and removes it from the address bar at once (src/features/auth/one-time-token.ts).
  test("the link from the email opens the accept page with its token, which is then removed from the address bar", async ({
    page,
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const email = runAddress("link");
    await inviteUser(request, admin, "E2E Link", email);
    const body = await latestMessage(request, email);
    const link = /https?:\/\/[^\s"<>]+accept-invite[^\s"<>]*/.exec(body)?.[0];
    if (!link) throw new Error("no invitation link in the latest message");
    const token = new URL(link).searchParams.get("token") ?? "";
    // The host in the email is the production address; the same path and query are opened on this run's host.
    await page.goto(`${SCHOOL}/accept-invite${new URL(link).search}`);
    await expect(page.getByRole("button", { name: "Accept and continue" })).toBeVisible();
    expect(page.url()).not.toContain(token);
  });
});
