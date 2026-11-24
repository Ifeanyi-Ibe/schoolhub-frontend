// The audit log and its export (ADR 0025, slice 8) against the test double. Reads and an export: no shared record is changed, so the
// journeys run on both projects.
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

test.describe("the audit log for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("entries are listed, filtered by outcome, and exported and downloaded", async ({ page }) => {
    await page.goto("/audit");
    await expect(
      page.getByRole("heading", { level: 1, name: "Audit log", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Changed a student's guardian")).toBeVisible();
    await page.getByRole("combobox", { name: "Outcome", exact: true }).selectOption("Denied");
    await page.getByRole("button", { name: "Show", exact: true }).click();
    await expect(page.getByText("Refused a reversal without approval")).toBeVisible();
    await expect(page.getByText("Changed a student's guardian")).toHaveCount(0);

    await page.getByRole("combobox", { name: "Outcome", exact: true }).selectOption("");
    await page.getByRole("button", { name: "Show", exact: true }).click();
    await page.getByRole("button", { name: "Start export" }).click();
    // The screen polls the export every two seconds until the server reports it finished.
    await expect(page.getByText("Export ready")).toBeVisible({ timeout: 15000 });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    expect((await download).suggestedFilename()).toBe("audit-log.csv");
  });

  test("the audit screen is free of axe violations", async ({ page }) => {
    await page.goto("/audit");
    await expect(
      page.getByRole("heading", { level: 1, name: "Audit log", exact: true }),
    ).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("the audit log for a user without the permission", () => {
  test("the user is told so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/audit");
    await expect(page.getByText("You cannot see the audit log")).toBeVisible();
  });
});
