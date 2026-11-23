// The admin dashboard (ADR 0025, slice 4) against the test double: read only, so it runs on both projects.
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { fakeJwt } from "./fake-api";
import { test, expect } from "./fixtures";
import { COOKIE, SCHOOL_ORIGIN } from "./origin";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function signInAs(context: BrowserContext, label: string) {
  await context.addCookies([
    { name: COOKIE.at, value: fakeJwt(label), url: SCHOOL_ORIGIN },
    { name: COOKIE.rt, value: `rt:${label}:1`, url: SCHOOL_ORIGIN },
  ]);
}

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test.describe("the admin dashboard", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("the school's figures are shown, money in naira, and the panels not included are named", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("120", { exact: true })).toBeVisible();
    await expect(page.getByText(/₦\s?285,000/).first()).toBeVisible();
    await expect(page.getByText("statement, virtual accounts")).toBeVisible();
  });

  test("the dashboard is free of axe violations", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard", exact: true }),
    ).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("the dashboard for a user without the permission", () => {
  test("the user is told so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/dashboard");
    await expect(page.getByText("You cannot see the dashboard")).toBeVisible();
  });
});
