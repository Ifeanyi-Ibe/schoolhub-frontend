// Announcements (ADR 0025, slice 2) against the test double. Creating, sending and cancelling change the shared announcements,
// so those journeys run on the desktop project only.
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

test.describe("announcements for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("an announcement is written, its audience checked, saved, and sent once", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: sends a shared announcement");
    await page.goto("/announcements");
    await expect(
      page.getByRole("heading", { level: 1, name: "Announcements", exact: true }),
    ).toBeVisible();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Sports day");
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Friday at 8am on the field.");
    await page.getByRole("button", { name: "Check audience" }).click();
    await expect(page.getByText("Recipients", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save announcement" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.getByRole("button", { name: "Send announcement" }).click();
    await page.getByRole("button", { name: "Send now" }).click();
    await expect(
      page.getByText(/Queued \d+; in the app \d+; suppressed 0; duplicates 0\./),
    ).toBeVisible();
    await expect(page.getByText(/Sent /).first()).toBeVisible();
  });

  test("an unsent announcement can be cancelled, and a sent one cannot", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: cancels a shared announcement");
    await page.goto("/announcements");
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Parent evening");
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Tuesday, 5pm.");
    await page.getByRole("button", { name: "Save announcement" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    const card = page.locator("li", { hasText: "Parent evening" });
    await card.getByRole("button", { name: "Cancel announcement" }).click();
    await card.getByRole("button", { name: "Cancel announcement" }).last().click();
    await expect(
      page
        .locator("li", { hasText: "Parent evening" })
        .getByText("Cancelled", { exact: true })
        .first(),
    ).toBeVisible();
  });

  test("the announcements screen is free of axe violations", async ({ page }) => {
    await page.goto("/announcements");
    await expect(
      page.getByRole("heading", { level: 1, name: "Announcements", exact: true }),
    ).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("announcements for a user without the permission", () => {
  test("the user is told so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/announcements");
    await expect(page.getByText("You cannot send announcements")).toBeVisible();
  });
});
