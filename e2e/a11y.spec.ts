// Accessibility (WCAG 2.2 AA) with axe on the production screens, at 360px and desktop.
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";
import { type Page } from "@playwright/test";
import { TEST_PASSWORD } from "./fake-api";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test("sign-in page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expectNoViolations(page);
});

test("sign-in page with a visible error", async ({ page, browserName }) => {
  // Firefox 159 crashes its content process when axe runs after text is typed into the sign-in form (not on a
  // bare page, and not with the page styles disabled). Reproduced in docs/TESTING.md, "Other engines".
  test.skip(browserName === "firefox", "Firefox content-process crash under axe after typing");
  await page.goto("/login");
  await page.getByLabel(/Email or phone/).fill("x@test.invalid");
  await page.getByLabel(/^Password/).fill("wrong-password-9999");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await expectNoViolations(page);
});

test("signed-in home and profile", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/Email or phone/).fill("ok@test.invalid");
  await page.getByLabel(/^Password/).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/home");
  // Scan only once the content has rendered (the shell loads the account first).
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  await expectNoViolations(page);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expectNoViolations(page);
});

test("offline fallback and unsupported-browser pages", async ({ page }) => {
  await page.goto("/offline.html");
  await expectNoViolations(page);
  await page.goto("/unsupported.html");
  await expectNoViolations(page);
});

test("sign-in controls are at least 44px tall", async ({ page }) => {
  await page.goto("/login");
  const buttons = page.locator("main").getByRole("button");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    if (box) expect(box.height, `button ${i}`).toBeGreaterThanOrEqual(44);
  }
});
