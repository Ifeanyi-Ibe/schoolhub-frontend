// Score sheets (ADR 0022, slice 1) against the test double: a teacher opens a sheet, enters scores, and submits it; an approver
// approves it and reopens it with a reason. The workflow tests change one shared sheet, so they run on the desktop project only;
// the access, offline and accessibility checks run on both.
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

test.describe("score sheets for a teacher", () => {
  // The approver test acts on the sheet the teacher opens, so the two run in order.
  test.describe.configure({ mode: "serial" });

  test("a teacher opens a sheet, enters scores, and submits it", async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: runs once, on the desktop project");
    await signInAs(context, "teacher");
    await page.goto("/scores");
    await expect(page.getByRole("heading", { name: "Score sheets", exact: true })).toBeVisible();

    const open = page.getByRole("button", { name: "Open score sheet" });
    // Wait for the sheet query to settle: either there is no sheet yet (the open button), or the sheet is shown.
    await expect(
      open.or(page.getByRole("heading", { level: 2, name: /Mathematics/ })),
    ).toBeVisible();
    if (await open.isVisible()) await open.click();
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Mathematics");

    const ada = page.getByRole("textbox", { name: "Test, maximum 20" }).first();
    await ada.fill("25");
    await expect(
      page.getByText("A score cannot be above the maximum of 20.").first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save scores" })).toBeDisabled();

    await ada.fill("18.5");
    await page.getByRole("textbox", { name: "Test, maximum 20" }).nth(1).fill("12");
    await page.getByRole("button", { name: "Save scores" }).click();
    await expect(page.getByText("Saved: 2 applied, 0 ignored, 0 rejected.")).toBeVisible();

    await page.getByRole("button", { name: "Submit for approval" }).click();
    await page.getByRole("button", { name: "Confirm submit" }).click();
    await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save scores" })).toHaveCount(0);
  });

  test("an approver approves a submitted sheet, then reopens it with a reason", async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "stateful: runs once, on the desktop project");
    // The account that holds both permissions also has the assignment the screen chooses the sheet from.
    await signInAs(context, "admin");
    await page.goto("/scores");
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Mathematics");

    await page.getByRole("button", { name: "Approve sheet" }).click();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Reopen sheet" }).click();
    await expect(page.getByText("Give a reason for reopening.")).toBeVisible();
    await page
      .getByRole("textbox", { name: "Reason for reopening" })
      .fill("A mark was entered in the wrong box");
    await page.getByRole("button", { name: "Reopen sheet" }).click();
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  });

  test.describe("while offline", () => {
    // The offline banner's chunk cannot load without a connection: expected here, as in the other offline journeys.
    test.use({ allowOfflineNetwork: true });

    test("a teacher saves scores on this device while offline, and they are sent when the connection returns", async ({
      page,
      context,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "stateful: runs once, on the desktop project");
      // Runs after the approver test has reopened the sheet, so it is a draft again.
      await signInAs(context, "teacher");
      await page.goto("/scores");
      await expect(page.getByRole("heading", { level: 2 })).toContainText("Mathematics");
      await context.setOffline(true);
      await expect(
        page.getByText("You are offline. Scores you enter are kept on this device"),
      ).toBeVisible();
      await page.getByRole("textbox", { name: "Test, maximum 20" }).first().fill("14");
      await page.getByRole("button", { name: "Save on this device" }).click();
      await expect(page.getByText("Saved on this device: 1 scores")).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Test, maximum 20" }).first()).toHaveValue(
        "14",
      );
      await context.setOffline(false);
      await expect(page.getByText("Sent: 1 saved")).toBeVisible();
      await expect(page.getByText("Waiting to send")).toHaveCount(0);
    });
  });
});

test.describe("score sheets: access, accessibility and offline", () => {
  test("a user without the permission is told so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/scores");
    await expect(page.getByText("You cannot enter scores")).toBeVisible();
  });

  test("an approver with no teaching assignment can still choose any class and subject", async ({
    page,
    context,
  }) => {
    await signInAs(context, "approver");
    await page.goto("/scores");
    await expect(page.getByRole("heading", { name: "Score sheets", exact: true })).toBeVisible();
    await expect(page.getByText("No subjects assigned")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Class" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Subject" })).toBeVisible();
  });

  test("the score screen is free of axe violations", async ({ page, context }) => {
    await signInAs(context, "teacher");
    await page.goto("/scores");
    await expect(page.getByRole("heading", { name: "Score sheets", exact: true })).toBeVisible();
    await expectNoViolations(page);
  });

  test.describe("offline", () => {
    // Leaving the network drops the prefetches Next starts for the navigation links: expected while offline.
    test.use({ allowOfflineNetwork: true });

    test("a teacher is told scores are kept on this device while offline", async ({
      page,
      context,
    }) => {
      await signInAs(context, "teacher");
      await page.goto("/scores");
      await expect(page.getByRole("heading", { name: "Score sheets", exact: true })).toBeVisible();
      await context.setOffline(true);
      await expect(
        page.getByText(
          "You are offline. Scores you enter are kept on this device and sent when the connection returns. Opening, submitting and approving need a connection.",
        ),
      ).toBeVisible();
      await context.setOffline(false);
    });
  });
});
