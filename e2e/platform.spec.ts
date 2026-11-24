// The platform area (ADR 0027) against the test double. Status changes change the shared schools, so those run on the desktop
// project only. A school session is refused by the platform, which the browser check proves.
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { fakeJwt } from "./fake-api";
import { PLATFORM_LOGIN, PLATFORM_MFA_CODE } from "./fake-platform";
import { test, expect } from "./fixtures";
import { COOKIE, SCHOOL_ORIGIN } from "./origin";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

async function signInToPlatform(page: Page) {
  await page.goto("/platform/sign-in");
  await page.getByRole("textbox", { name: "Email or user name" }).fill(PLATFORM_LOGIN.identifier);
  await page.getByLabel("Password").fill(PLATFORM_LOGIN.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: "Code from your authenticator" }).fill(PLATFORM_MFA_CODE);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/platform\/tenants/);
}

test.describe("the platform for a staff member", () => {
  test("a wrong password is refused without saying which part was wrong", async ({ page }) => {
    await page.goto("/platform/sign-in");
    await page.getByRole("textbox", { name: "Email or user name" }).fill(PLATFORM_LOGIN.identifier);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByText("The sign-in did not work. Check your details and try again."),
    ).toBeVisible();
  });

  test("the password and the code sign the staff member in, and the schools are listed", async ({
    page,
  }) => {
    await signInToPlatform(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Schools", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Greenfield Academy")).toBeVisible();
    await expect(page.getByText("Riverside College")).toBeVisible();
  });

  test("a school is suspended with a reason, and reactivated", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: changes a shared school's status");
    await signInToPlatform(page);
    await page.getByText("Riverside College").click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Riverside College", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(page.getByText("Give a reason.")).toBeVisible();
    await page.getByRole("textbox", { name: "Reason (required)" }).fill("Unpaid for two terms");
    await page.getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(page.getByText("The school is suspended.")).toBeVisible();
    await page.getByRole("button", { name: "Reactivate" }).click();
    await expect(page.getByText("The school is active again.")).toBeVisible();
  });

  test("the metrics are shown", async ({ page }) => {
    await signInToPlatform(page);
    await page.goto("/platform/metrics");
    await expect(page.getByText("Monthly recurring revenue")).toBeVisible();
  });

  test("the sign-in and the schools are free of axe violations", async ({ page }) => {
    await page.goto("/platform/sign-in");
    await expect(
      page.getByRole("heading", { name: "Platform sign-in", exact: true }),
    ).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("a school session on the platform", () => {
  test("a school session cannot read the platform, and is asked to sign in to it", async ({
    page,
    context,
  }: {
    page: Page;
    context: BrowserContext;
  }) => {
    await context.addCookies([{ name: COOKIE.at, value: fakeJwt("admin"), url: SCHOOL_ORIGIN }]);
    await page.goto("/platform/tenants");
    await expect(page.getByText("Sign in to the platform")).toBeVisible();
    await expect(page.getByText("Greenfield Academy")).toHaveCount(0);
  });
});
