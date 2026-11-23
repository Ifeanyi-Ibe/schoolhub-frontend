// Amendments (ADR 0024, slice 5) against the test double. The score journeys leave their sheet in draft, so a request is refused
// as not published: the screen must say so, and must not claim a change was made. The approval path is checked for an unknown
// reference, which the server refuses.
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

test.describe("amendments for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("a change is requested with its reason, and the server's answer is shown", async ({
    page,
  }) => {
    await page.goto("/amendments");
    await expect(page.getByRole("heading", { name: "Amendments", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Student" })).toContainText("Ada Okafor");

    await page.getByRole("textbox", { name: "New score" }).fill("5");
    await page
      .getByRole("textbox", { name: "Reason for the change" })
      .fill("Recheck of the script");
    await page.getByRole("button", { name: "Request change" }).click();
    // The sheet is not published in this journey, so the server refuses the request. Either answer is shown as the server gave it.
    await expect(
      page.getByText(/Request recorded\. Status:|The school refused this change \(/),
    ).toBeVisible();
  });

  test("a reference the server does not know is refused, and nothing is decided", async ({
    page,
  }) => {
    await page.goto("/amendments");
    await page
      .getByRole("textbox", { name: "Reference" })
      .fill("0190a6c2-0000-7000-8000-000000000000");
    await page.getByRole("button", { name: "Approve change" }).click();
    await expect(
      page.getByText(
        "The school refused this change (assessment.amendment_not_found). Nothing was saved.",
      ),
    ).toBeVisible();
  });

  test("a rejection needs a reason", async ({ page }) => {
    await page.goto("/amendments");
    await page
      .getByRole("textbox", { name: "Reference" })
      .fill("0190a6c2-0000-7000-8000-000000000000");
    await expect(page.getByRole("button", { name: "Reject change" })).toBeDisabled();
  });

  test("the amendments screen is free of axe violations", async ({ page }) => {
    await page.goto("/amendments");
    await expect(page.getByRole("heading", { name: "Amendments", exact: true })).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("amendments for a teacher", () => {
  test("a teacher without the amendment permission is told so", async ({ page, context }) => {
    await signInAs(context, "teacher");
    await page.goto("/amendments");
    await expect(page.getByText("You cannot amend results")).toBeVisible();
  });
});
