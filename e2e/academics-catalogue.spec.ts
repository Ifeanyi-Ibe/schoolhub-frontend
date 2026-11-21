// Academic setup screens (subjects and mappings, grading, assessment, calendar) against the test double. The
// double validates every request against the contract, so a request these screens send that the contract
// does not allow fails the run.
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

test.describe("academic setup for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("subjects: a subject is added, and a class level takes it as compulsory", async ({
    page,
  }) => {
    await page.goto("/academics/subjects");
    await expect(page.getByRole("heading", { name: "Subjects", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add a subject" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a subject" });
    await dialog.getByLabel("Code").fill("BIO");
    const subjectName = `Biology ${Date.now().toString(36)}`;
    await dialog.getByLabel("Name").fill(subjectName);
    await dialog.getByLabel("Category").selectOption("Core");
    await dialog.getByRole("button", { name: "Save subject" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.locator("td", { hasText: subjectName })).toBeVisible();

    await page.getByLabel("Class level").selectOption({ label: "Junior Secondary 1" });
    const row = page.locator("li", { hasText: subjectName });
    await row.getByLabel("Taken").check();
    await row.getByLabel("Compulsory").check();
    await page.getByRole("button", { name: "Save subjects for this level" }).click();
    await expect(page.getByRole("status").getByText("Subjects saved for this level")).toBeVisible();
  });

  test("grading: overlapping bands are refused on screen, and a valid set saves", async ({
    page,
  }) => {
    await page.goto("/academics/grading");
    await page.getByRole("button", { name: /Standard grading/ }).click();
    const save = page.getByRole("button", { name: "Save bands" });
    await expect(save).toBeDisabled();

    // Band 2 now starts at 39: it overlaps band 1 (0 to 39).
    await page.getByLabel("From").nth(1).fill("39");
    await expect(
      page.getByText("Two bands overlap. Each score belongs to one band only."),
    ).toBeVisible();
    await expect(save).toBeDisabled();

    await page.getByLabel("From").nth(1).fill("40");
    await expect(page.getByText("Two bands overlap.")).toHaveCount(0);
    await page.getByLabel("Remark").nth(1).fill("");
    await expect(page.getByText("Enter a remark for this band.")).toBeVisible();
    await expect(save).toBeDisabled();

    // Back to the saved remark, then a real change, so there is something to save.
    await page.getByLabel("Remark").nth(1).fill("Credit");
    await page.getByLabel("Grade").nth(1).fill("C+");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText("Bands saved", { exact: true })).toBeVisible();
  });

  test("assessment: the components must add up to 100, and the running total is shown", async ({
    page,
  }) => {
    await page.goto("/academics/assessment");
    await page.getByRole("button", { name: /Termly assessment/ }).click();
    await expect(page.getByText("Total so far: 100 of 100")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save components" })).toBeDisabled();

    await page.getByRole("button", { name: "Add component" }).click();
    await page.getByLabel("Maximum score").nth(2).fill("30");
    await expect(page.getByText("The maximum scores must add up to 100.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save components" })).toBeDisabled();

    await page.getByLabel("Component").nth(2).fill("Project");
    await page.getByLabel("Maximum score").nth(2).fill("0");
    await expect(
      page.getByText("The maximum score must be a whole number from 1 to 100."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save components" })).toBeDisabled();
  });

  test("calendar: a day is added, and the year's holidays are imported", async ({ page }) => {
    await page.goto("/academics/calendar");
    await expect(page.getByText("Independence Day")).toBeVisible();
    await page.getByRole("button", { name: "Add a day" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a day" });
    await dialog.getByLabel("Date").fill("2026-12-25");
    await dialog.getByLabel("Name").fill("Christmas Day");
    await dialog.getByLabel("Type").selectOption("Holiday");
    await dialog.getByRole("button", { name: "Save day" }).click();
    await expect(page.getByText("Christmas Day")).toBeVisible();

    await page.getByRole("button", { name: "Import holidays" }).click();
    await expect(
      page.getByText("Imported 2 holidays. 1 were already in the calendar."),
    ).toBeVisible();
  });

  test("every academic setup screen is free of axe violations", async ({ page }) => {
    for (const path of [
      "/academics/subjects",
      "/academics/grading",
      "/academics/assessment",
      "/academics/calendar",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(page);
    }
  });
});

test.describe("academic setup for a user without academics access", () => {
  test("the screens say so and offer no changes", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/academics/subjects");
    await expect(page.getByText("You cannot view academic setup")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a subject" })).toHaveCount(0);
  });
});
