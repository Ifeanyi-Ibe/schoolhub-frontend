// Class levels and arms for an administrator, and the access gate for a user without academic permissions.
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

test.describe("class levels for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("the navigation offers Academics, and the levels list shows the school's levels", async ({
    page,
  }) => {
    await page.goto("/home");
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Academics" }),
    ).toBeVisible();
    await page.goto("/academics/levels");
    await expect(page.getByRole("heading", { name: "Class levels", exact: true })).toBeVisible();
    await expect(page.locator("td", { hasText: "Junior Secondary 1" })).toBeVisible();
  });

  test("choosing a level shows its arms, and the level is in the URL", async ({ page }) => {
    await page.goto("/academics/levels");
    await page
      .locator("tr", { hasText: "Junior Secondary 1" })
      .getByRole("button", { name: "Arms" })
      .click();
    await expect(page).toHaveURL(/\?level=/);
    await expect(page.getByRole("heading", { name: "Arms in Junior Secondary 1" })).toBeVisible();
    await expect(page.locator("td", { hasText: /^A$/ })).toBeVisible();
  });

  test("a new level is saved and appears in the list", async ({ page }) => {
    // A unique name that cannot contain the seeded "Junior Secondary 1" (a random suffix could start with 1).
    const name = "Trial level " + Math.random().toString(36).slice(2, 8);
    await page.goto("/academics/levels");
    await page.getByRole("button", { name: "Add a level" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a class level" });
    await dialog.getByLabel("Code").fill("J" + name.slice(-4));
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Section").selectOption("JuniorSecondary");
    await dialog.getByLabel("Order").fill("2");
    await dialog.getByRole("button", { name: "Save level" }).click();
    await expect(page.getByText("Class level saved", { exact: true })).toBeVisible();
    await expect(page.locator("td", { hasText: name })).toBeVisible();
  });

  test("a level with a missing code or a non-numeric order says what to fix, and sends nothing", async ({
    page,
  }) => {
    await page.goto("/academics/levels");
    await page.getByRole("button", { name: "Add a level" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a class level" });
    await dialog.getByLabel("Name").fill("Broken");
    await dialog.getByLabel("Order").fill("first");
    await dialog.getByRole("button", { name: "Save level" }).click();
    await expect(dialog.getByText("Enter a code")).toBeVisible();
    await expect(dialog.getByText("Choose a section")).toBeVisible();
    await expect(dialog.getByText("Enter the order as a whole number, zero or more")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Broken" })).toHaveCount(0);
  });

  test("an arm is added to the chosen level", async ({ page }) => {
    const arm = "B" + Math.random().toString(36).slice(2, 6);
    await page.goto("/academics/levels");
    await page
      .locator("tr", { hasText: "Junior Secondary 1" })
      .getByRole("button", { name: "Arms" })
      .click();
    await page.getByRole("button", { name: "Add an arm" }).click();
    const dialog = page.getByRole("dialog", { name: "Add an arm to Junior Secondary 1" });
    await dialog.getByLabel("Arm").fill(arm);
    await dialog.getByLabel("Capacity").fill("35");
    await dialog.getByRole("button", { name: "Add arm" }).click();
    await expect(page.getByText("Arm added", { exact: true })).toBeVisible();
    await expect(page.locator("td", { hasText: arm })).toBeVisible();
  });

  test("the levels and arms screen passes axe at 360px and on desktop", async ({ page }) => {
    await page.goto("/academics/levels?level=0190a6c2-0000-7000-8000-000000000301");
    await expect(page.getByRole("heading", { name: "Class levels", exact: true })).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("class levels without academic permissions", () => {
  test("the navigation hides Academics, and the page says the user has no access", async ({
    page,
    context,
  }) => {
    await signInAs(context, "ok");
    await page.goto("/home");
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Academics" }),
    ).toHaveCount(0);
    await page.goto("/academics/levels");
    await expect(page.getByText("You do not have access to class levels")).toBeVisible();
  });
});
