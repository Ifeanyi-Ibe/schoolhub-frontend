// Attendance (F5) against the test double. The double validates every request against the contract, and it refuses one
// student on every save, so a refused row is always reachable. Offline is simulated with the browser's network switch;
// the queue lives in the browser's IndexedDB, which each test run starts without.
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { fakeJwt } from "./fake-api";
import { test, expect } from "./fixtures";
import { COOKIE, SCHOOL_ORIGIN } from "./origin";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const ARM = "0190a6c2-0000-7000-8000-000000000401";

async function signInAs(context: BrowserContext, label: string) {
  await context.addCookies([
    { name: COOKIE.at, value: fakeJwt(label), url: SCHOOL_ORIGIN },
    { name: COOKIE.rt, value: `rt:${label}:1`, url: SCHOOL_ORIGIN },
  ]);
}

/** Whether the device has stored this register's roster (the offline roster is written after the rows show). */
function rosterStored(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("schoolhub-attendance");
        open.onerror = () => resolve(false);
        open.onsuccess = () => {
          const db = open.result;
          const count = db.transaction("rosters", "readonly").objectStore("rosters").count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result > 0);
          };
          count.onerror = () => resolve(false);
        };
      }),
  );
}

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

const registerPath = (date: string) =>
  `/attendance/register?classArmId=${ARM}&date=${date}&arm=JSS1%20A`;

function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

test.describe("attendance for a teacher", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("the home lists the teacher's class, and the register shows its students online", async ({
    page,
  }) => {
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Take register" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Register");
    await expect(page.getByText("Ada Okafor")).toBeVisible();
    await expect(page.getByText("Bola Musa")).toBeVisible();
  });

  test("marks are saved and sent; a refused row stays on the screen with the server's reason", async ({
    page,
  }) => {
    await page.goto(registerPath(today()));
    await expect(page.getByText("Ada Okafor")).toBeVisible();
    await page
      .getByRole("group", { name: "Status for Ada Okafor" })
      .getByRole("button", { name: "Present" })
      .click();
    await page
      .getByRole("group", { name: "Status for Bola Musa" })
      .getByRole("button", { name: "Absent" })
      .click();
    await page
      .getByRole("group", { name: "Status for Refused Pupil" })
      .getByRole("button", { name: "Present" })
      .click();
    await page.getByRole("button", { name: "Save on this device" }).click();

    await expect(page.getByText(/Sent: \d+ saved/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Marks the server did not accept" }),
    ).toBeVisible();
    await expect(page.getByText("Refused Pupil: Not enrolled in this class.")).toBeVisible();
  });

  test("a refused item can be discarded, and then it is gone", async ({ page }) => {
    await page.goto(registerPath(today()));
    await expect(page.getByText("Ada Okafor")).toBeVisible();
    await page
      .getByRole("group", { name: "Status for Refused Pupil" })
      .getByRole("button", { name: "Absent" })
      .click();
    await page.getByRole("button", { name: "Save on this device" }).click();
    await expect(
      page.getByRole("heading", { name: "Marks the server did not accept" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Discard these marks" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Marks the server did not accept" }),
    ).toHaveCount(0);
  });

  test("a locked register says so; reopening needs a reason, and then the register is open", async ({
    page,
  }, testInfo) => {
    // Each viewport reopens its own locked day: the double keeps its state for the whole run.
    const locked = testInfo.project.name === "desktop" ? "2026-09-30" : "2026-09-29";
    await page.goto(registerPath(locked));
    await expect(page.getByText("This register is locked.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Reopen register" }).click();
    const dialog = page.getByRole("dialog", { name: "Reopen this register" });
    await dialog.getByRole("button", { name: "Reopen register", exact: true }).click();
    await expect(dialog.getByText("Give a reason for reopening this register.")).toBeVisible();
    await dialog.getByLabel("Reason for reopening").fill("Late entry from the class teacher");
    await dialog.getByRole("button", { name: "Reopen register", exact: true }).click();
    await expect(page.getByText("This register is locked.", { exact: false })).toHaveCount(0);
  });

  test("reports: absentees for a day, and the term summary with its spreadsheet", async ({
    page,
  }) => {
    // The journey marks its own absence first. The other viewport may mark the same student, and the server keeps the
    // newer mark (ignored rows are counted in the message), so the check is that the mark was sent, not how many.
    await page.goto(registerPath(today()));
    await expect(page.getByText("Bola Musa")).toBeVisible();
    await page
      .getByRole("group", { name: "Status for Bola Musa" })
      .getByRole("button", { name: "Absent" })
      .click();
    await page.getByRole("button", { name: "Save on this device" }).click();
    await expect(page.getByText(/Sent: \d+ saved/).first()).toBeVisible();

    await page.goto("/attendance/reports");
    await expect(
      page.getByRole("heading", { name: "Attendance reports", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Bola Musa").first()).toBeVisible();

    await page.getByRole("button", { name: "Term summary" }).click();
    await expect(page.getByText("Ada Okafor").first()).toBeVisible();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download spreadsheet" }).click();
    expect((await downloading).suggestedFilename()).toContain("attendance-");
  });

  test("the home, the register and the reports are free of axe violations", async ({ page }) => {
    for (const path of ["/attendance", registerPath(today()), "/attendance/reports"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(page);
    }
  });
});

test.describe("attendance offline", () => {
  // Leaving the network drops the prefetches Next starts for the navigation links: expected while offline.
  test.use({ allowOfflineNetwork: true });

  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("offline: marks are kept on the device, the rows show by order, and they are sent on reconnect", async ({
    page,
    context,
  }) => {
    await page.goto(registerPath(today()));
    await expect(page.getByText("Ada Okafor")).toBeVisible();
    // The roster is kept on the device while online; only then can the connection go.
    await expect.poll(() => rosterStored(page)).toBe(true);
    await context.setOffline(true);
    await expect(page.getByText("You are offline.", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Student 1", { exact: true })).toBeVisible();
    await page
      .getByRole("group", { name: "Status for Student 1" })
      .getByRole("button", { name: "Late" })
      .click();
    await page.getByLabel("Arrival time").fill("08:35");
    await page.getByRole("button", { name: "Save on this device" }).click();
    await expect(
      page.getByText("Saved on this device. It will be sent when you are back online."),
    ).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText(/Sent: \d+ saved/).first()).toBeVisible();
  });
});

test.describe("attendance for a user without the permission", () => {
  test("the register says so", async ({ page, context }) => {
    await signInAs(context, "plain");
    await page.goto("/attendance");
    await expect(page.getByText("You cannot take attendance")).toBeVisible();
  });
});
