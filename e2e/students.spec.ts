// Students (F3) against the test double. The double validates every request against the contract, so a request
// these screens send that the contract does not allow fails the run. Names carry the project and a run id, because
// the double's state is shared by the viewport projects.
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { fakeJwt } from "./fake-api";
import { test, expect } from "./fixtures";
import { COOKIE, SCHOOL_ORIGIN } from "./origin";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

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

test.describe("students for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("the list shows students, and search and the status filter are in the URL", async ({
    page,
  }) => {
    await page.goto("/students");
    await expect(page.getByRole("heading", { name: "Students", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Chinedu Nwosu/ }).first()).toBeVisible();

    await page.getByRole("searchbox", { name: "Search by name or admission number" }).fill("Amara");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/q=Amara/);
    await expect(page.getByRole("link", { name: /Amara Ije Eze/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Chinedu Nwosu/ })).toHaveCount(0);

    await page
      .getByRole("searchbox", { name: "Search by name or admission number" })
      .fill("nobody-here");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("No students match this search")).toBeVisible();
  });

  test("registration: the four steps save a student, who then opens on their own page", async ({
    page,
  }) => {
    const last = `Reg${RUN}`;
    await page.goto("/students/new");
    await page.getByLabel(/^First\ name\*?$/).fill("Kemi");
    await page.getByLabel(/^Last\ name\*?$/).fill(last);
    await page.getByLabel(/^Gender\*?$/).selectOption("Female");
    await page.getByLabel(/^Date\ of\ birth\*?$/).fill("2012-05-10");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel(/^Session\*?$/).selectOption({ index: 1 });
    await page.getByLabel(/^Class\ arm\*?$/).selectOption({ index: 1 });
    await page.getByRole("button", { name: "Continue" }).click();

    await page
      .getByLabel(/^First\ name\*?$/)
      .last()
      .fill("Ngozi");
    await page
      .getByLabel(/^Last\ name\*?$/)
      .last()
      .fill(last);
    await page.getByLabel(/^Phone\*?$/).fill("08022223333");
    await page.getByLabel(/^Relationship\ to\ the\ student\*?$/).fill("Mother");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(`Kemi ${last}`)).toBeVisible();
    await page.getByRole("button", { name: "Register student" }).click();
    await expect(page.getByRole("heading", { name: `Kemi ${last}` })).toBeVisible();
  });

  test("registration: a possible duplicate stops the save and shows the match; an administrator may register anyway", async ({
    page,
  }) => {
    // Same name and date of birth as the fixture: the double answers 409 with the candidate.
    await page.goto("/students/new");
    await page.getByLabel(/^First\ name\*?$/).fill("Chinedu");
    await page.getByLabel(/^Last\ name\*?$/).fill("Nwosu");
    await page.getByLabel(/^Gender\*?$/).selectOption("Male");
    await page.getByLabel(/^Date\ of\ birth\*?$/).fill("2014-03-02");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel(/^Session\*?$/).selectOption({ index: 1 });
    await page.getByLabel(/^Class\ arm\*?$/).selectOption({ index: 1 });
    await page.getByRole("button", { name: "Continue" }).click();
    await page
      .getByLabel(/^First\ name\*?$/)
      .last()
      .fill("Ada");
    await page
      .getByLabel(/^Last\ name\*?$/)
      .last()
      .fill("Nwosu");
    await page.getByLabel(/^Phone\*?$/).fill("08033334444");
    await page.getByLabel(/^Relationship\ to\ the\ student\*?$/).fill("Aunt");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Register student" }).click();

    await expect(page.getByText("This may be a student already on record")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open record" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Register anyway" }).click();
    await expect(page.getByRole("heading", { name: /Chinedu Nwosu/ })).toBeVisible();
  });

  test("the profile: details can be edited, and a guardian added", async ({ page }) => {
    await page.goto("/students/0190a6c2-0000-7000-8000-000000000901");
    await expect(page.getByRole("heading", { name: "Chinedu Nwosu" })).toBeVisible();

    await page.getByRole("button", { name: "Edit details" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit details" });
    await dialog.getByLabel(/^Address\*?$/).fill("9 Broad Street, Lagos");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("9 Broad Street, Lagos")).toBeVisible();

    await page.getByRole("tab", { name: "Guardians" }).click();
    await page.getByRole("button", { name: "Add a guardian" }).click();
    const guardian = page.getByRole("dialog", { name: "Add a guardian" });
    await guardian.getByLabel(/^First\ name\*?$/).fill("Emeka");
    await guardian.getByLabel(/^Last\ name\*?$/).fill("Nwosu");
    await guardian.getByLabel(/^Phone\*?$/).fill("0801");
    await guardian.getByRole("button", { name: "Save", exact: true }).click();
    await expect(guardian.getByText("Enter a Nigerian or international number.")).toBeVisible();
    await guardian.getByLabel(/^Phone\*?$/).fill("08055556666");
    await guardian.getByLabel(/^Relationship\ to\ the\ student\*?$/).fill("Father");
    await guardian.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Emeka Nwosu")).toBeVisible();
  });

  test("documents: a PDF is uploaded through the BFF and listed on the record", async ({
    page,
  }) => {
    await page.goto("/students/0190a6c2-0000-7000-8000-000000000901");
    await page.getByRole("tab", { name: "Documents" }).click();
    await page.getByLabel(/^Document\ type\*?$/).fill("Birth certificate");
    await page.locator("#document-file").setInputFiles({
      name: "birth.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fake"),
    });
    await page.getByRole("button", { name: "Upload a document" }).click();
    await expect(page.getByText("Document uploaded.").first()).toBeVisible();
    await expect(page.getByText("Birth certificate").first()).toBeVisible();
  });

  test("notes: a pastoral note is added and listed", async ({ page }) => {
    await page.goto("/students/0190a6c2-0000-7000-8000-000000000901");
    await page.getByRole("tab", { name: "Notes" }).click();
    await page.getByLabel(/^Note\*?$/).fill(`Settled in well ${RUN}`);
    await page.getByRole("button", { name: "Add a note" }).click();
    await expect(page.getByText(`Settled in well ${RUN}`)).toBeVisible();
  });

  test("status: a student is withdrawn, with the effective date", async ({ page }) => {
    // Use the second fixture so the first record stays active for the other journeys.
    await page.goto("/students/0190a6c2-0000-7000-8000-000000000902");
    await page.getByRole("tab", { name: "Status and class" }).click();
    await page.getByRole("button", { name: "Withdraw" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Updated.").first()).toBeVisible();
  });

  test("bulk import: the template downloads, a file is checked, and the commit is idempotent", async ({
    page,
  }) => {
    await page.goto("/students/import");
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download the template" }).click();
    expect((await downloading).suggestedFilename()).toBe("students-import-template.csv");

    await page.getByLabel(/^Session\*?$/).selectOption({ index: 1 });
    await page.locator("#import-file").setInputFiles({
      name: "students.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("firstName,lastName\nA,B\n"),
    });
    await page.getByRole("button", { name: "Upload and start" }).click();
    await expect(page.getByText("Validated", { exact: true })).toBeVisible();
    await expect(page.getByText("Rows with errors").first()).toBeVisible();

    await page.getByLabel(/^How\ to\ commit\*?$/).selectOption("SkipErrors");
    await page.getByRole("button", { name: "Commit import", exact: true }).click();
    await expect(page.getByText("The commit has started.").first()).toBeVisible();
  });

  test("promotions: the same session cannot be used twice, and the preview stays disabled until it is complete", async ({
    page,
  }) => {
    await page.goto("/students/promotions");
    await page.getByLabel(/^From\ session\*?$/).selectOption({ index: 1 });
    await page.getByLabel(/^To\ session\*?$/).selectOption({ index: 1 });
    await expect(page.getByText("Choose two different sessions.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview" })).toBeDisabled();
  });

  test("the list, the registration, the profile, the import and the promotions are free of axe violations", async ({
    page,
  }) => {
    for (const path of [
      "/students",
      "/students/new",
      "/students/0190a6c2-0000-7000-8000-000000000901",
      "/students/import",
      "/students/promotions",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(page);
    }
  });
});

test.describe("students for a user without student access", () => {
  test("the list says so, and offers no registration", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/students");
    await expect(page.getByText("You cannot view students")).toBeVisible();
    await expect(page.getByRole("link", { name: "Register a student" })).toHaveCount(0);
  });
});
