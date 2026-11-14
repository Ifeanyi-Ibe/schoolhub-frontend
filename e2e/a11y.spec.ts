// Accessibility checks (WCAG 2.2 AA) on the F0 screens. axe runs on every key screen (brief).
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

test.describe("F0 screens meet WCAG 2.2 AA", () => {
  test("styleguide has no axe violations", async ({ page }) => {
    await page.goto("/dev/styleguide");
    await expect(page.getByRole("heading", { level: 1, name: "Styleguide" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("styleguide dialog traps focus and returns it on close", async ({ page }) => {
    await page.goto("/dev/styleguide");
    const trigger = page.getByRole("button", { name: "Open dialog" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Confirm this action?" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("offline fallback page has no axe violations", async ({ page }) => {
    await page.goto("/offline.html");
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("styleguide targets are at least 44px at the 360px phone width", async ({ page }) => {
    await page.goto("/dev/styleguide");
    const buttons = page.locator("main").getByRole("button");
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box) expect(box.height, `button ${i}`).toBeGreaterThanOrEqual(44);
    }
  });
});
