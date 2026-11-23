// Notification templates, the message log, statistics and the SMS wallet (ADR 0025, slice 3) against the test double. Editing,
// resetting and retrying change the shared state, so those journeys run on the desktop project only.
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

test.describe("notifications for an administrator", () => {
  // The retry and the reset depend on the edit made by the first journey, so the journeys run in order.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("a template is edited, previewed with sample values, and saved", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: changes a shared template");
    await page.goto("/notifications");
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications", exact: true }),
    ).toBeVisible();
    await page
      .locator("li", { hasText: "fee_reminder" })
      .getByRole("button", { name: "Edit" })
      .click();
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Dear parent, {studentName}'s fees are due.");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText("Dear parent, Ada Okafor's fees are due.")).toBeVisible();
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText("Template saved.")).toBeVisible();
  });

  test("a failed message is retried, and the default text is restored", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "stateful: retries a shared message and resets a shared template",
    );
    await page.goto("/notifications");
    const failed = page.locator("li", { hasText: "Carrier timeout" });
    await failed.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("The message has been queued again.")).toBeVisible();
    await page
      .locator("li", { hasText: "fee_reminder" })
      .getByRole("button", { name: "Edit" })
      .click();
    await page.getByRole("button", { name: "Use default text" }).click();
    await expect(page.getByText("Template returned to the default text.")).toBeVisible();
  });

  test("statistics and the SMS wallet are shown", async ({ page }) => {
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "SMS units", exact: true })).toBeVisible();
    await expect(page.getByText("Available", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Messages", { exact: true }).first()).toBeVisible();
  });

  test("the notifications screen is free of axe violations", async ({ page }) => {
    await page.goto("/notifications");
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications", exact: true }),
    ).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("notifications for a user without the permission", () => {
  test("the user is told so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/notifications");
    await expect(page.getByText("You cannot manage notifications")).toBeVisible();
  });
});
