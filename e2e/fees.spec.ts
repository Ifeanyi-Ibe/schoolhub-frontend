// Fees and payments (F6) against the test double. The double keeps the money rules: integer kobo, idempotent writes, and
// a reversal approved only by someone other than the person who asked. Names carry a run id, because the double's state
// is shared by the viewport projects.
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { fakeJwt } from "./fake-api";
import { test, expect } from "./fixtures";
import { COOKIE, SCHOOL_ORIGIN } from "./origin";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const STUDENT = "0190a6c2-0000-7000-8000-000000000e01";

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

test.describe("fees for a bursar", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("the overview shows collection, debtors and reconciliation", async ({ page }) => {
    await page.goto("/fees");
    await expect(page.getByRole("heading", { name: "Fee reports", exact: true })).toBeVisible();
    await expect(page.getByText("Collected").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Debtors", exact: true })).toBeVisible();
    await expect(page.getByText("Reconciliation").first()).toBeVisible();
  });

  test("a fee item is added and a structure is saved as a draft, then activated", async ({
    page,
  }) => {
    await page.goto("/fees/setup");
    const itemName = `Bus ${RUN}`;
    const items = page
      .getByRole("region", { name: "Fee items" })
      .or(page.locator("section, div").filter({ hasText: "Fee items" }).first());
    await page.getByRole("textbox", { name: "Name" }).first().fill(itemName);
    await page.getByRole("combobox", { name: "Category" }).first().selectOption("Transport");
    await page.getByRole("button", { name: "Add fee item" }).click();
    await expect(page.getByText("Fee item saved.").first()).toBeVisible();
    await expect(items.getByText(itemName).first()).toBeVisible();

    const structure = `Term fees ${RUN}`;
    await page.getByRole("textbox", { name: "Name" }).nth(1).fill(structure);
    await page.getByRole("combobox", { name: "Session" }).selectOption({ index: 1 });
    await page.getByRole("combobox", { name: "Class level" }).selectOption({ index: 1 });
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByRole("combobox", { name: "Fee item" }).last().selectOption({ index: 1 });
    await page.getByRole("textbox", { name: "Amount (naira)" }).last().fill("15000");
    await page.getByRole("button", { name: "Save structure" }).click();
    await expect(page.getByText("Fee structure saved as a draft.").first()).toBeVisible();
    await expect(page.getByRole("cell", { name: structure }).first()).toBeVisible();

    await page.getByRole("button", { name: "Activate" }).first().click();
    await expect(page.getByText("Structure activated.").first()).toBeVisible();
  });

  test("invoices are generated for the term, and one is adjusted with a reason", async ({
    page,
  }) => {
    await page.goto("/fees/invoices");
    await page.getByRole("combobox", { name: "Session" }).selectOption({ index: 1 });
    await page.getByRole("combobox", { name: "Term" }).selectOption({ index: 1 });
    await page.getByRole("combobox", { name: "Class level" }).selectOption({ index: 1 });
    await page.getByRole("button", { name: "Generate", exact: true }).click();
    await expect(page.getByText(/Generated \d+ invoices/)).toBeVisible();

    await page
      .getByRole("button", { name: /Open invoice INV-/ })
      .first()
      .click();
    const detail = page.getByRole("heading", { name: /Invoice INV-/ });
    await expect(detail).toBeVisible();
    await page.getByRole("combobox", { name: "Adjustment" }).selectOption("Credit");
    await page.getByRole("textbox", { name: "Amount (naira)" }).last().fill("100");
    await page
      .getByRole("textbox", { name: "Reason", exact: true })
      .last()
      .fill("Overcharged on the bus line");
    await page.getByRole("button", { name: "Apply adjustment" }).click();
    await expect(page.getByText("Adjustment applied.").first()).toBeVisible();

    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    expect((await downloading).suggestedFilename()).toContain("INV-");
  });

  test("a payment is recorded once; a reversal is asked for and cannot be approved by the same person", async ({
    page,
  }) => {
    await page.goto("/fees/payments");
    await page.getByRole("textbox", { name: "Student id" }).first().fill(STUDENT);
    await page.getByRole("textbox", { name: "Amount (naira)" }).first().fill("5000");
    await page.getByRole("textbox", { name: "Reference" }).first().fill(`RCPT ${RUN}`);
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText("Payment recorded.").first()).toBeVisible();
    await expect(page.getByText(`RCPT ${RUN}`).first()).toBeVisible();

    const row = page
      .getByRole("row")
      .filter({ hasText: `RCPT ${RUN}` })
      .first();
    await row.getByRole("button", { name: "Request reversal" }).click();
    await page
      .getByRole("textbox", { name: "Reason for reversal" })
      .first()
      .fill("Entered against the wrong student");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(
      page.getByText("Reversal requested. Another person must approve it."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Approve reversal" }).first().click();
    await expect(
      page.getByText("You asked for this reversal, so another person must approve it.").first(),
    ).toBeVisible();
  });

  test("unallocated money is assigned to a student", async ({ page }) => {
    await page.goto("/fees/payments");
    // Each viewport's run takes the next open unallocated payment; the double seeds one per run.
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("textbox", { name: "Student id" }) })
      .first();
    await expect(row).toBeVisible();
    await row.getByRole("textbox", { name: "Student id" }).fill(STUDENT);
    await row.getByRole("button", { name: "Assign" }).click();
    await expect(page.getByText("Payment assigned to the student.").first()).toBeVisible();
  });

  test("the ledger shows a student's lines and balance", async ({ page }) => {
    await page.goto(`/fees/ledger?studentId=${STUDENT}`);
    await expect(page.getByRole("heading", { name: "Student ledger", exact: true })).toBeVisible();
    await expect(page.getByText("Balance").first()).toBeVisible();
    await expect(page.getByText(/Invoice INV-/).first()).toBeVisible();
  });

  test("the fee screens are free of axe violations", async ({ page }) => {
    for (const path of [
      "/fees",
      "/fees/setup",
      "/fees/invoices",
      "/fees/payments",
      `/fees/ledger?studentId=${STUDENT}`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(page);
    }
  });
});

test.describe("the second approver", () => {
  test("approves a reversal someone else asked for", async ({ page, context }) => {
    // The bursar asks for the reversal in the journey above; this user is a different person who may approve.
    await signInAs(context, "approver");
    await page.goto("/fees/payments");
    const row = page.getByRole("row").filter({ hasText: "Reversal awaiting approval" }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Approve reversal" }).click();
    await expect(page.getByText("Reversal approved.").first()).toBeVisible();
  });
});

test.describe("fees for a user without fee access", () => {
  test("the screens say so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/fees");
    await expect(page.getByText("You cannot view fees")).toBeVisible();
  });
});
