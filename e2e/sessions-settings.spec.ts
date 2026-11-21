// Academic sessions, terms, school days and rollover, and school settings, against the test double. The
// double validates every request against the contract, so a request these screens send that the contract does
// not allow fails the run.
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

test.describe("sessions, terms and rollover for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("a session gets a term, its school days show, and it can be made current", async ({
    page,
  }) => {
    await page.goto("/academics/sessions");
    await expect(
      page.getByRole("heading", { name: "Sessions and terms", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Show terms" }).first().click();
    await expect(page.getByRole("heading", { name: /Terms in 2026\/2027/ })).toBeVisible();

    await page.getByRole("button", { name: "Add a term" }).click();
    const term = page.getByRole("dialog", { name: "New term" });
    await term.getByLabel("No.").fill("2");
    const termName = `Term ${Date.now().toString(36)}`;
    await term.getByLabel("Term", { exact: true }).fill(termName);
    await term.getByLabel("From").fill("2027-01-11");
    await term.getByLabel("To").fill("2027-04-02");
    await term.getByRole("button", { name: "Save term" }).click();
    await expect(page.locator("td", { hasText: termName })).toBeVisible();

    const row = page.locator("tr", { hasText: termName });
    await row.getByRole("button", { name: "School days" }).click();
    await expect(page.getByText("Total days")).toBeVisible();
    await expect(page.getByText("105", { exact: true })).toBeVisible();

    await row.getByRole("button", { name: "Make current term" }).click();
    await expect(page.locator("tr", { hasText: termName })).toContainText("Current");
  });

  test("a new session is started by rollover, and it appears in the list", async ({ page }) => {
    await page.goto("/academics/sessions");
    await page.getByRole("button", { name: "Start next session" }).click();
    const dialog = page.getByRole("dialog", { name: "Start a new session" });
    const sessionName = `Session ${Date.now().toString(36)}`;
    await dialog.getByLabel("Session", { exact: true }).fill(sessionName);
    await dialog.getByLabel("From").fill("2027-09-06");
    await dialog.getByLabel("To").fill("2028-07-21");
    await dialog.getByRole("button", { name: "Start session" }).click();
    await expect(
      page.getByRole("status").getByText(`The new session ${sessionName} has started.`),
    ).toBeVisible();
    await expect(page.locator("td", { hasText: sessionName })).toBeVisible();
  });

  test("a session with an end before its start is refused on screen", async ({ page }) => {
    await page.goto("/academics/sessions");
    await page.getByRole("button", { name: "New session" }).click();
    const dialog = page.getByRole("dialog", { name: "New session" });
    await dialog.getByLabel("Session", { exact: true }).fill("Bad dates");
    await dialog.getByLabel("From").fill("2029-09-06");
    await dialog.getByLabel("To").fill("2029-07-01");
    await dialog.getByRole("button", { name: "Save session" }).click();
    await expect(
      dialog.getByText("The session ends before it starts. Check the dates."),
    ).toBeVisible();
  });

  test("school settings: the profile saves, and the brand colour is checked for contrast", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "School settings", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).nth(0).click();
    const profile = page.getByRole("dialog", { name: "School profile" });
    await profile.getByLabel("School name").fill("Greenfield Academy Lagos");
    await profile.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.getByText("Greenfield Academy Lagos")).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).nth(1).click();
    const branding = page.getByRole("dialog", { name: "Branding" });
    await expect(branding.getByText(/meets AA contrast|Adjusted to/).first()).toBeVisible();
    await branding.getByLabel("Primary colour").fill("#zzzzzz");
    await branding.getByRole("button", { name: "Save", exact: true }).click();
    await expect(branding.getByText("Enter a six-digit colour, such as #0F5C4D.")).toBeVisible();
    await branding.getByRole("button", { name: "Cancel" }).click();
  });

  test("policies save with the toggles and the threshold checked", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Edit" }).nth(2).click();
    const dialog = page.getByRole("dialog", { name: "Policies" });
    await dialog.getByLabel("Fees cleared threshold (%)").fill("150");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByText("Enter a whole number from 0 to 100.")).toBeVisible();
    await dialog.getByLabel("Fees cleared threshold (%)").fill("80");
    await dialog.getByLabel("Results need fees cleared").check();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("the sessions and settings screens are free of axe violations", async ({ page }) => {
    for (const path of ["/academics/sessions", "/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(page);
    }
  });
});

test.describe("sessions and settings for a user without the permission", () => {
  test("the settings screen says so; the sessions screen says so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/settings");
    await expect(page.getByText("You cannot change school settings")).toBeVisible();
    await page.goto("/academics/sessions");
    await expect(page.getByText("You cannot view academic setup")).toBeVisible();
  });
});
