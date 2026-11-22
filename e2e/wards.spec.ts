// The parent slice (F6, ADR 0021) against the test double: the wards, a ward's invoices, card payment through the gateway,
// and the server's confirmation on return. The double's gateway takes the payment and sends the parent back to the school.
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { fakeJwt } from "./fake-api";
import { test, expect } from "./fixtures";
import { COOKIE, SCHOOL_ORIGIN } from "./origin";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const WARD = "0190a6c2-0000-7000-8000-000000000e01";

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

test.describe("a parent with a linked child", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "parent");
  });

  test("the children are listed, and one opens with the invoices and the transfer details", async ({
    page,
  }) => {
    await page.goto("/wards");
    await expect(page.getByRole("heading", { name: "Your children", exact: true })).toBeVisible();
    await page
      .getByRole("link", { name: /Ada Okafor/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/wards/${WARD}`));
    await expect(page.getByText("INV-SEED").first()).toBeVisible();
    await expect(page.getByText("GFA/0101").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy admission number" })).toBeVisible();
  });

  test("a card payment goes to the gateway and comes back confirmed by the server", async ({
    page,
  }) => {
    await page.goto(`/wards/${WARD}`);
    await page.getByRole("button", { name: "Start a card payment" }).click();
    await page.getByRole("textbox", { name: "Amount (naira)" }).fill("5000");
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL(/\/wards\/return\?reference=/);
    await expect(page.getByText("Payment confirmed. Thank you.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download receipt" })).toBeVisible();
  });

  test("the parent screens are free of axe violations", async ({ page }) => {
    for (const path of ["/wards", `/wards/${WARD}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(page);
    }
  });
});

test.describe("a parent offline", () => {
  // Leaving the network drops the prefetches Next starts for the navigation links: expected while offline.
  test.use({ allowOfflineNetwork: true });

  test.beforeEach(async ({ context }) => {
    await signInAs(context, "parent");
  });

  test("card payment cannot be started while offline", async ({ page, context }) => {
    await page.goto(`/wards/${WARD}`);
    await expect(page.getByRole("button", { name: "Start a card payment" })).toBeEnabled();
    await context.setOffline(true);
    await expect(page.getByText("Card payment needs a connection. You are offline.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start a card payment" })).toBeDisabled();
    await context.setOffline(false);
  });
});

test.describe("an account with no linked child", () => {
  test("the list says so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/wards");
    await expect(page.getByText("You cannot view students")).toBeVisible();
  });
});
