// Compliance (ADR 0025, slice 5) against the test double. Recording consents, requesting and refusing data requests, and starting an
// export change the shared state, so those journeys run on the desktop project only. The same account cannot decide its own request.
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

test.describe("compliance for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("a consent is recorded for a person, and it is listed", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: records a shared consent");
    await page.goto("/compliance");
    await expect(
      page.getByRole("heading", { level: 1, name: "Compliance", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Kind of person or record", exact: true })
      .first()
      .fill("Student");
    await page
      .getByRole("textbox", { name: "Their identifier", exact: true })
      .first()
      .fill("0190a6c2-0000-7000-8000-000000000f01");
    await page.getByRole("button", { name: "Find consents" }).click();
    await page
      .getByRole("textbox", { name: "Where it was given", exact: true })
      .fill("Admission form");
    await page.getByRole("button", { name: "Record consent" }).click();
    await expect(page.getByText("Consent recorded.")).toBeVisible();
    await expect(page.getByText(/Messaging by Any: active/)).toBeVisible();
  });

  test("an export request is sent, and the same person cannot approve it", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: sends a shared data request");
    await page.goto("/compliance");
    await page
      .getByRole("textbox", { name: "Kind of person or record", exact: true })
      .last()
      .fill("Student");
    await page
      .getByRole("textbox", { name: "Their identifier", exact: true })
      .last()
      .fill("0190a6c2-0000-7000-8000-000000000f01");
    await page
      .getByRole("textbox", { name: "Reason", exact: true })
      .fill("Parent asked for a copy");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Request sent for a second person to decide.")).toBeVisible();
    const row = page.locator("li", { hasText: "Parent asked for a copy" }).first();
    await row.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(
      page.getByText(
        "The school refused this change (compliance.maker_checker). Nothing was saved.",
      ),
    ).toBeVisible();
  });

  test("the school export is started and its status is checked", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: starts a shared export");
    await page.goto("/compliance");
    await page.getByRole("button", { name: "Start export" }).click();
    await page.getByRole("button", { name: "Check status" }).click();
    await expect(page.getByText("Status: Completed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download school export" })).toBeVisible();
  });

  test("the compliance screen is free of axe violations", async ({ page }) => {
    await page.goto("/compliance");
    await expect(
      page.getByRole("heading", { level: 1, name: "Compliance", exact: true }),
    ).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("compliance for a user without the permission", () => {
  test("the user is told so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/compliance");
    await expect(page.getByText("You cannot manage compliance")).toBeVisible();
  });
});
