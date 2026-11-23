// The staff inbox and notification preferences (ADR 0025, slice 1) against the test double. Marking messages read and changing a
// preference change the shared fake, so those journeys run on the desktop project only.
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

test.describe("the staff inbox", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("messages are listed, one is marked read, and all are marked read", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: marks the shared messages read");
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
    await expect(page.getByText("Fee reminder")).toBeVisible();
    await page
      .locator("li", { hasText: "Fee reminder" })
      .getByRole("button", { name: "Mark as read" })
      .click();
    await expect(
      page.locator("li", { hasText: "Fee reminder" }).getByText("Read", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await expect(page.getByText(/\d+ messages marked as read\./)).toBeVisible();
  });

  test("a preference is changed and saved; a required one cannot be changed", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: changes the shared preferences");
    await page.goto("/inbox");
    await expect(
      page.getByRole("heading", { name: "Notification preferences", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "security by email" })).toBeDisabled();

    const sms = page.getByRole("checkbox", { name: "fees by sms" });
    const before = await sms.isChecked();
    await sms.click();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByText("Preferences saved.")).toBeVisible();
    expect(await page.getByRole("checkbox", { name: "fees by sms" }).isChecked()).toBe(!before);
  });

  test("the inbox is free of axe violations", async ({ page }) => {
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("the inbox for a user without the permission", () => {
  test("the user is told so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/inbox");
    await expect(page.getByText("You cannot read the inbox")).toBeVisible();
  });
});
