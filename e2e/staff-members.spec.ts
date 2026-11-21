// Staff (F4) against the test double. The double validates every request against the contract, so a request these
// screens send that the contract does not allow fails the run. Names carry a run id, because the double's state is
// shared by the viewport projects.
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { fakeJwt } from "./fake-api";
import { test, expect } from "./fixtures";
import { COOKIE, SCHOOL_ORIGIN } from "./origin";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const NGOZI = "/staff/0190a6c2-0000-7000-8000-000000000a01";
const TUNDE = "/staff/0190a6c2-0000-7000-8000-000000000a02";

async function signInAs(context: BrowserContext, label: string) {
  await context.addCookies([
    { name: COOKIE.at, value: fakeJwt(label), url: SCHOOL_ORIGIN },
    { name: COOKIE.rt, value: `rt:${label}:1`, url: SCHOOL_ORIGIN },
  ]);
}

/** Registers a new staff member through the form and returns the address of their record. */
async function createStaff(page: Page, first: string, last: string): Promise<string> {
  await page.goto("/staff/new");
  await page.getByLabel(/^First\ name\*?$/).fill(first);
  await page.getByLabel(/^Last\ name\*?$/).fill(last);
  await page.getByLabel(/^Gender\*?$/).selectOption("Male");
  await page.getByLabel(/^Date\ of\ birth\*?$/).fill("1988-02-20");
  await page.getByLabel(/^Phone\*?$/).fill("08066667777");
  await page.getByLabel(/^Job\ title\*?$/).fill("Science teacher");
  await page.getByLabel(/^Hire\ date\*?$/).fill("2026-09-07");
  await page.getByRole("button", { name: "Create staff record" }).click();
  await expect(page.getByRole("heading", { name: `${first} ${last}` })).toBeVisible();
  return new URL(page.url()).pathname;
}

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test.describe("staff for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("the list shows staff, and search is in the URL", async ({ page }) => {
    await page.goto("/staff");
    await expect(page.getByRole("heading", { name: "Staff", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ngozi Eze/ }).first()).toBeVisible();

    await page.getByRole("searchbox", { name: "Search by name or staff number" }).fill("Bello");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/q=Bello/);
    await expect(page.getByRole("link", { name: /Tunde Bello/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Ngozi Eze/ })).toHaveCount(0);

    await page
      .getByRole("searchbox", { name: "Search by name or staff number" })
      .fill("nobody-here");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("No staff match this search")).toBeVisible();
  });

  test("a staff member is added with the required details and opens on their own page", async ({
    page,
  }) => {
    const last = `Staff${RUN}`;
    await createStaff(page, "Kemi", last);
  });

  test("the form shows what is wrong before anything is saved", async ({ page }) => {
    await page.goto("/staff/new");
    await page.getByRole("button", { name: "Create staff record" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Check the" }).first()).toBeVisible();
    await expect(page.getByText("Enter the first name.").first()).toBeVisible();
    await expect(page.getByText("Enter a phone number.").first()).toBeVisible();
  });

  test("the details of a record can be edited", async ({ page }) => {
    await page.goto(NGOZI);
    await expect(page.getByRole("heading", { name: "Ngozi Eze" })).toBeVisible();
    await page.getByRole("button", { name: "Edit details" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit staff details" });
    await dialog.getByLabel(/^Address\*?$/).fill("9 Broad Street, Lagos");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("9 Broad Street, Lagos")).toBeVisible();
  });

  test("assignments: a class is saved, and a form teacher the API already holds is refused with its code", async ({
    page,
  }) => {
    const url = await createStaff(page, "Assign", `Staff${RUN}`);
    await page.goto(url);
    await page.getByRole("tab", { name: "Assignments" }).click();
    await page.getByRole("button", { name: "Add assignment" }).click();
    await page.getByLabel(/^Class\ arm\*?$/).selectOption({ index: 1 });
    await page.getByRole("button", { name: "Save assignments" }).click();
    await expect(page.getByText("Assignments saved.").first()).toBeVisible();

    // Ngozi already holds the form teacher role for the only arm: the API refuses it, and the code is shown.
    await page.getByRole("button", { name: "Add assignment" }).click();
    const row = page.getByRole("listitem").last();
    await row.getByLabel(/^Class\ arm\*?$/).selectOption({ index: 1 });
    await row.getByLabel(/^Subject\*?$/).selectOption({ index: 1 });
    await row.getByLabel("Form teacher").check();
    await page.getByRole("button", { name: "Save assignments" }).click();
    await expect(page.getByText("staff.form_teacher_taken")).toBeVisible();
  });

  test("assignments: two form teachers for one class on the same screen are caught before saving", async ({
    page,
  }) => {
    await page.goto(NGOZI);
    await page.getByRole("tab", { name: "Assignments" }).click();
    await page.getByRole("button", { name: "Add assignment" }).click();
    const rows = page.getByRole("listitem");
    await rows
      .last()
      .getByLabel(/^Class\ arm\*?$/)
      .selectOption({ index: 1 });
    await rows.last().getByLabel("Form teacher").check();
    await page.getByRole("button", { name: "Save assignments" }).click();
    await expect(
      page.getByText("A class arm can have only one form teacher in a session."),
    ).toBeVisible();
  });

  test("leave: a request is made, then approved by an administrator", async ({ page }) => {
    const type = `Study ${RUN}`;
    await page.goto(NGOZI);
    await page.getByRole("tab", { name: "Leave" }).click();
    await page.getByLabel(/^Type\ of\ leave\*?$/).fill(type);
    await page.getByLabel(/^Starts\ on\*?$/).fill("2026-12-10");
    await page.getByLabel(/^Ends\ on\*?$/).fill("2026-12-12");
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page.getByText("Leave requested.").first()).toBeVisible();

    const item = page.getByRole("listitem").filter({ hasText: type });
    await item.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Leave approved.").first()).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: type }).getByText("Decided"),
    ).toBeVisible();
  });

  test("leave: an end date before the start date is refused on the screen", async ({ page }) => {
    await page.goto(NGOZI);
    await page.getByRole("tab", { name: "Leave" }).click();
    await page.getByLabel(/^Type\ of\ leave\*?$/).fill("Annual");
    await page.getByLabel(/^Starts\ on\*?$/).fill("2026-12-10");
    await page.getByLabel(/^Ends\ on\*?$/).fill("2026-12-01");
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page.getByText("The end date cannot be before the start date.")).toBeVisible();
  });

  test("an invitation is sent with a role", async ({ page }) => {
    await page.goto(TUNDE);
    await page.getByRole("button", { name: "Invite to sign in" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite Tunde Bello to sign in" });
    await dialog.getByLabel(/^Email\*?$/).fill(`invite-${RUN}@example.test`);
    await dialog.getByRole("checkbox", { name: "Registrar" }).check();
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByText("Invitation sent.").first()).toBeVisible();
  });

  test("a staff member is deactivated after confirmation, and reactivated", async ({ page }) => {
    await page.goto(TUNDE);
    await page.getByRole("button", { name: "Deactivate", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Deactivate Tunde?" });
    await dialog.getByRole("button", { name: "Deactivate", exact: true }).click();
    await expect(page.getByText("Staff member deactivated.").first()).toBeVisible();
    await page.getByRole("button", { name: "Reactivate", exact: true }).click();
    await expect(page.getByText("Staff member reactivated.").first()).toBeVisible();
  });

  test("my classes lists the teacher's own class and subject", async ({ page }) => {
    await page.goto("/my-classes");
    await expect(page.getByRole("heading", { name: "My classes", exact: true })).toBeVisible();
    await expect(page.getByText("Junior Secondary 1 · A").first()).toBeVisible();
    await expect(page.getByText("Mathematics").first()).toBeVisible();
  });

  test("the list, the new form, a record and my classes are free of axe violations", async ({
    page,
  }) => {
    for (const path of ["/staff", "/staff/new", NGOZI, "/my-classes"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(page);
    }
  });
});

test.describe("staff for a user without staff access", () => {
  test("the list says so, and offers no new record", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/staff");
    await expect(page.getByText("You cannot view staff records")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add a staff member" })).toHaveCount(0);
  });
});
