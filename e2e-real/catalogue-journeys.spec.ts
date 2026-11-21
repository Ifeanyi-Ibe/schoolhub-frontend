// Academic setup against the real backend: subjects, grading bands, assessment components and calendar days.
// Creates only e2e- data, reads it back from the API, and removes the calendar day it adds. Not run in the
// last session (the backend on the configured port belonged to another process); see docs/OPEN_ITEMS.md.
import { type Page } from "@playwright/test";
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const apiHeaders = (token: string) => ({
  "X-Bff-Key": e2e.bffKey,
  "X-Tenant": e2e.schoolSlug,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

async function signInAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/Email or phone/).fill(e2e.adminIdentifier);
  await page.getByLabel(/^Password/).fill(e2e.adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/home");
}

test.describe.serial("academic setup", () => {
  const tag = `${Date.now().toString(36)}`;
  const subjectCode = `E2E${tag.toUpperCase()}`.slice(0, 12);
  const schemeName = `e2e-grading-${tag}`;
  const assessmentName = `e2e-assessment-${tag}`;
  const holiday = { date: "2031-03-14", name: `e2e holiday ${tag}` };
  let holidayId = "";

  test("a subject is added on screen and the API lists it", async ({ page, request }) => {
    await signInAdmin(page);
    await page.goto("/academics/subjects");
    await page.getByRole("button", { name: "Add a subject" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a subject" });
    await dialog.getByLabel("Code").fill(subjectCode);
    await dialog.getByLabel("Name").fill(`e2e subject ${tag}`);
    await dialog.getByLabel("Category").selectOption("Elective");
    await dialog.getByRole("button", { name: "Save subject" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    const admin = await adminAccessToken(request);
    const subjects = (await (
      await request.get(url("/api/v1/subjects"), { headers: apiHeaders(admin) })
    ).json()) as Array<{
      code: string;
    }>;
    expect(subjects.map((s) => s.code)).toContain(subjectCode);
  });

  test("a grading scheme gets three bands that cover 0 to 100, and the API holds them", async ({
    page,
    request,
  }) => {
    await signInAdmin(page);
    await page.goto("/academics/grading");
    await page.getByLabel("Scheme name").fill(schemeName);
    await page.getByRole("button", { name: "Create scheme" }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^${schemeName}`) })).toBeVisible();

    const rows: Array<[string, string, string, string]> = [
      ["0", "39", "F", "Fail"],
      ["40", "69", "C", "Credit"],
      ["70", "100", "A", "Excellent"],
    ];
    for (let i = 0; i < rows.length; i++) {
      await page.getByRole("button", { name: "Add band" }).click();
      const [min, max, grade, remark] = rows[i]!;
      await page.getByLabel("From", { exact: true }).nth(i).fill(min);
      await page.getByLabel("To", { exact: true }).nth(i).fill(max);
      await page.getByLabel("Grade", { exact: true }).nth(i).fill(grade);
      await page.getByLabel("Remark", { exact: true }).nth(i).fill(remark);
    }
    await expect(page.getByRole("button", { name: "Save bands" })).toBeEnabled();
    await page.getByRole("button", { name: "Save bands" }).click();
    await expect(page.getByText("Bands saved", { exact: true })).toBeVisible();

    const admin = await adminAccessToken(request);
    const schemes = (await (
      await request.get(url("/api/v1/grading-schemes"), { headers: apiHeaders(admin) })
    ).json()) as Array<{
      name: string;
      bands: Array<{ min: number; max: number }>;
    }>;
    const mine = schemes.find((s) => s.name === schemeName);
    expect(mine?.bands.map((b) => [b.min, b.max])).toEqual([
      [0, 39],
      [40, 69],
      [70, 100],
    ]);
  });

  test("an assessment scheme's components add up to 100, and the API holds them", async ({
    page,
    request,
  }) => {
    await signInAdmin(page);
    await page.goto("/academics/assessment");
    await page.getByLabel("Scheme name").fill(assessmentName);
    await page.getByRole("button", { name: "Create scheme" }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(`^${assessmentName}`) }),
    ).toBeVisible();

    for (const [i, [name, max]] of (
      [
        ["Test", "40"],
        ["Exam", "60"],
      ] as const
    ).entries()) {
      await page.getByRole("button", { name: "Add component" }).click();
      await page.getByLabel("Component", { exact: true }).nth(i).fill(name);
      await page.getByLabel("Maximum score", { exact: true }).nth(i).fill(max);
    }
    await expect(page.getByText("Total so far: 100 of 100")).toBeVisible();
    await page.getByRole("button", { name: "Save components" }).click();
    await expect(page.getByText("Components saved", { exact: true })).toBeVisible();

    const admin = await adminAccessToken(request);
    const schemes = (await (
      await request.get(url("/api/v1/assessment-schemes"), { headers: apiHeaders(admin) })
    ).json()) as Array<{
      name: string;
      components: Array<{ maxScore: number }>;
    }>;
    const mine = schemes.find((s) => s.name === assessmentName);
    expect(mine?.components.map((c) => c.maxScore)).toEqual([40, 60]);
  });

  test("a holiday is added to the calendar, read back from the API, and removed again", async ({
    page,
    request,
  }) => {
    await signInAdmin(page);
    await page.goto(`/academics/calendar`);
    await page.getByLabel("From", { exact: true }).fill("2031-01-01");
    await page.getByLabel("To", { exact: true }).fill("2031-12-31");
    await page.getByRole("button", { name: "Add a day" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a day" });
    await dialog.getByLabel("Date").fill(holiday.date);
    await dialog.getByLabel("Name").fill(holiday.name);
    await dialog.getByLabel("Type").selectOption("Holiday");
    await dialog.getByRole("button", { name: "Save day" }).click();
    await expect(page.getByText(holiday.name)).toBeVisible();

    const admin = await adminAccessToken(request);
    const days = (await (
      await request.get(url("/api/v1/calendar/days?from=2031-01-01&to=2031-12-31"), {
        headers: apiHeaders(admin),
      })
    ).json()) as Array<{ id: string; name: string }>;
    holidayId = days.find((d) => d.name === holiday.name)?.id ?? "";
    expect(holidayId).not.toBe("");

    const removed = await request.delete(url(`/api/v1/calendar/days/${holidayId}`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect([200, 204]).toContain(removed.status());
  });

  test("the calendar's type and the subject category are the backend's values (B-25)", async ({
    request,
  }) => {
    // The contract does not list these values; the backend parses them. This checks the screen's options
    // are accepted, by a request the backend must answer (not a refusal for the value).
    const admin = await adminAccessToken(request);
    const res = await request.post(url("/api/v1/calendar/days"), {
      headers: apiHeaders(admin),
      data: { date: "2031-06-12", type: "SpecialEvent", name: `e2e event ${tag}` },
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(422);
    if (res.status() === 201) {
      const body = (await res.json()) as { id: string };
      await request.delete(url(`/api/v1/calendar/days/${body.id}`), {
        headers: apiHeaders(admin),
        failOnStatusCode: false,
      });
    }
  });
});
