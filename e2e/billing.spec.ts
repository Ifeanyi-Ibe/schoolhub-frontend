// Billing (ADR 0025, slice 6) against the test double. Paying an invoice changes the shared invoices, so that journey runs on the
// desktop project only; the reads run on both.
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

test.describe("billing for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("the subscription and its invoices are shown, in naira", async ({ page }) => {
    await page.goto("/billing");
    await expect(
      page.getByRole("heading", { level: 1, name: "Billing", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Standard", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/₦\s?25,000/).first()).toBeVisible();
    await expect(page.getByText("Not yet paid").first()).toBeVisible();
  });

  test("an unpaid invoice is paid after a confirmation, and the server's answer is shown", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: pays a shared invoice");
    await page.goto("/billing");
    const unpaid = page.locator("li", { hasText: "Not yet paid" }).first();
    await unpaid.getByRole("button", { name: "Pay this invoice" }).click();
    await unpaid.getByRole("button", { name: "Pay now" }).click();
    await expect(page.getByText(/Invoice Paid\. School account: Active\./)).toBeVisible();
  });

  test("the billing screen is free of axe violations", async ({ page }) => {
    await page.goto("/billing");
    await expect(
      page.getByRole("heading", { level: 1, name: "Billing", exact: true }),
    ).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("billing for a user without the permission", () => {
  test("the user is told so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/billing");
    await expect(page.getByText("You cannot see billing")).toBeVisible();
  });
});
