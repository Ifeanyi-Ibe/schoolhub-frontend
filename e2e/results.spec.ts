// Results (ADR 0024, slice 3) against the test double: compute the class's results (a job), read the broadsheet, export it, and
// rate and remark a student. The writes replace earlier values, so the journeys run on both projects.
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

test.describe("results for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("results are computed, the broadsheet shows each student, and a student is rated and remarked", async ({
    page,
  }) => {
    await page.goto("/results");
    await expect(page.getByRole("heading", { name: "Results", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Compute results" }).click();
    await expect(
      page.getByText("Results are computed. The broadsheet below is up to date."),
    ).toBeVisible();

    await expect(page.getByRole("heading", { name: "Broadsheet", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ada Okafor" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Ada Okafor" })).toBeVisible();

    await page.getByRole("textbox", { name: "Punctuality (Affective)" }).fill("4");
    await page.getByRole("button", { name: "Save domains" }).click();
    await expect(page.getByText("Domains saved.")).toBeVisible();

    await page.getByRole("textbox", { name: "Teacher's remark" }).fill("Works steadily");
    await page.getByRole("button", { name: "Save teacher's remark" }).click();
    await expect(page.getByText("Remark saved.").first()).toBeVisible();
  });

  test("a rating out of range is refused before it is sent", async ({ page }) => {
    await page.goto("/results");
    await page.getByRole("button", { name: "Ada Okafor" }).click();
    await page.getByRole("textbox", { name: "Handwriting (Psychomotor)" }).fill("9");
    await page.getByRole("button", { name: "Save domains" }).click();
    await expect(page.getByText("Use a number from 1 to 5.")).toBeVisible();
  });

  test("the broadsheet can be downloaded as a workbook", async ({ page }) => {
    await page.goto("/results");
    await expect(page.getByRole("heading", { name: "Broadsheet", exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download broadsheet" }).click();
    expect((await download).suggestedFilename()).toBe("broadsheet.xlsx");
  });

  test("the results screen is free of axe violations", async ({ page }) => {
    await page.goto("/results");
    await expect(page.getByRole("heading", { name: "Results", exact: true })).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("results for a teacher", () => {
  test("a teacher reads the broadsheet but cannot compute results", async ({ page, context }) => {
    await signInAs(context, "teacher");
    await page.goto("/results");
    await expect(page.getByRole("heading", { name: "Broadsheet", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Compute results" })).toHaveCount(0);
  });
});

test.describe("results for a user without the permission", () => {
  test("the user is told so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/results");
    await expect(page.getByText("You cannot see results")).toBeVisible();
  });
});
