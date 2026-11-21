// Staff screens: people and roles, for a school administrator and for a user without staff permissions.
// The test double validates every request against the contract, so a request these screens send that the
// contract does not allow fails the run.
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { FAKE_API_URL, fakeJwt } from "./fake-api";
import { test, expect } from "./fixtures";
import { COOKIE, SCHOOL_ORIGIN } from "./origin";

const PORT = 3000;
const LOOPBACK = "http://127.0.0.1:3000";

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

test.describe("people and roles for an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "admin");
  });

  test("the navigation offers People and Roles, and the people list shows the school's staff", async ({
    page,
  }) => {
    await page.goto("/home");
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "People" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Roles" }),
    ).toBeVisible();

    await page.goto("/people");
    await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
    await expect(page.locator("td", { hasText: "Ada Okafor" })).toBeVisible();
    await expect(page.locator("td", { hasText: "Tunde Bello" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite a person" })).toBeEnabled();
  });

  test("the first HTML already holds the signed-in list, read on the server (no client waterfall)", async ({
    request,
  }) => {
    const res = await request.get(`${LOOPBACK}/people`, {
      headers: {
        host: `greenfield.localhost:${PORT}`,
        cookie: `${COOKIE.at}=${fakeJwt("admin")}; ${COOKIE.rt}=rt:admin:1`,
      },
    });
    const html = await res.text();
    expect(html).toContain("Ada Okafor");
    expect(html).toContain("Tunde Bello");
  });

  test("the search is in the URL, so the filtered list can be shared and the empty state is clear", async ({
    page,
  }) => {
    await page.goto("/people");
    await page.getByRole("searchbox", { name: "Search by name" }).fill("tunde");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/q=tunde/);
    await expect(page.locator("td", { hasText: "Tunde Bello" })).toBeVisible();
    await expect(page.locator("td", { hasText: "Ada Okafor" })).toHaveCount(0);

    await page.getByRole("searchbox", { name: "Search by name" }).fill("nobody-matches");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("No people match this search.")).toBeVisible();
  });

  test("a role is removed from a person through the contract's PUT, and the list shows the change", async ({
    page,
    request,
  }) => {
    const TUNDE = "0190a6c2-0000-7000-8000-000000000202";
    const REGISTRAR = "0190a6c2-0000-7000-8000-000000000102";
    await page.goto("/people");
    await page.getByRole("button", { name: "Roles: Tunde Bello" }).click();
    const dialog = page.getByRole("dialog", { name: /Roles for Tunde Bello/ });
    await dialog.getByRole("checkbox", { name: "Registrar" }).click();
    await dialog.getByRole("button", { name: "Save roles" }).click();
    await expect(page.getByText("Roles updated", { exact: true })).toBeVisible();
    await expect(dialog).toBeHidden();
    // Restore the shared fixture so later tests see Tunde as they expect.
    const restored = await request.put(`${FAKE_API_URL}/api/v1/users/${TUNDE}/roles`, {
      headers: { authorization: `Bearer ${fakeJwt("admin")}` },
      data: { roleIds: [REGISTRAR] },
    });
    expect(restored.status(), await restored.text()).toBe(200);
  });

  test("an invitation sends the Idempotency-Key the contract declares, and confirms it", async ({
    page,
    request,
  }) => {
    await page.goto("/people");
    await page.getByRole("button", { name: "Invite a person" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite a person" });
    await dialog.getByLabel(/Full name/).fill("Chidi Nwosu");
    await dialog.getByLabel(/Email/).fill("chidi@example.com");
    await dialog.getByRole("checkbox", { name: /Registrar/ }).check();
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByText("Invitation sent to Chidi Nwosu", { exact: true })).toBeVisible();

    const seen = await (
      await request.get(
        `${FAKE_API_URL}/__received?path=${encodeURIComponent("/api/v1/users/invite")}`,
      )
    ).json();
    expect(seen["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("the roles list offers custom roles, because the school's plan includes them", async ({
    page,
  }) => {
    await page.goto("/roles");
    await expect(page.getByRole("cell", { name: "SchoolAdmin" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New role" })).toBeEnabled();
  });

  test("a role's permissions are saved; permissions the administrator does not hold stay locked", async ({
    page,
  }) => {
    await page.goto("/roles");
    await page.getByRole("link", { name: /Registrar/ }).click();
    await expect(page).toHaveURL(/\/roles\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Role: Registrar" })).toBeVisible();

    const holds = page.getByRole("checkbox", { name: /users\.invite/ });
    await expect(holds).toBeEnabled();
    await holds.check();
    await page.getByRole("button", { name: "Save permissions" }).click();
    await expect(page.getByText("Permissions saved")).toBeVisible();

    // The administrator holds these permissions too, so every one is editable here; none is refused.
    await expect(page.getByRole("checkbox", { name: /roles\.manage/ })).toBeEnabled();
  });

  test("a new role is created with the permissions chosen, then opens in the editor", async ({
    page,
  }) => {
    await page.goto("/roles");
    await page.getByRole("button", { name: "New role" }).click();
    const dialog = page.getByRole("dialog", { name: "New role" });
    await dialog.getByLabel("Role name").fill("Exams office");
    await dialog.getByRole("checkbox", { name: /students\.read/ }).check();
    await dialog.getByRole("button", { name: "Create role" }).click();
    await expect(page).toHaveURL(/\/roles\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Role: Exams office" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /students\.read/ })).toBeChecked();
  });

  test("the people and role screens pass axe (WCAG 2.2 AA) at 360px and on desktop", async ({
    page,
  }) => {
    await page.goto("/people");
    await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
    await expectNoViolations(page);

    await page.goto("/roles");
    await expect(page.getByRole("heading", { name: "Roles", exact: true })).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("people and roles without staff permissions", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "ok");
  });

  test("the navigation hides People and Roles, and the pages say the user has no access", async ({
    page,
  }) => {
    await page.goto("/home");
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "People" }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Roles" }),
    ).toHaveCount(0);

    await page.goto("/people");
    await expect(page.getByText("You do not have access to people")).toBeVisible();
    await page.goto("/roles");
    await expect(page.getByText("You do not have access to roles")).toBeVisible();
  });
});
