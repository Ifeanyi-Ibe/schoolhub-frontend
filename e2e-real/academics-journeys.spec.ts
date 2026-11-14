// Class levels and arms against the real backend. Creates only e2e- data (a level with an e2e- code, and an
// arm in it). Read back from the API, and the backend's refusal of a duplicate code is shown on screen.
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";

test.beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 13_000));
});

test.describe.serial("class levels", () => {
  const code = `E2E-${Date.now().toString(36)}`;
  const name = `E2E level ${code}`;

  async function signInAdmin(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.getByLabel(/Email or phone/).fill(e2e.adminIdentifier);
    await page.getByLabel(/^Password/).fill(e2e.adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/home");
  }

  test("a level and an arm are created through the screen, and the API holds them", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/academics/levels");
    await page.getByRole("button", { name: "Add a level" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a class level" });
    await dialog.getByLabel("Code").fill(code);
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Section").selectOption("Primary");
    await dialog.getByLabel("Order").fill("99");
    await dialog.getByRole("button", { name: "Save level" }).click();
    await expect(page.getByText("Class level saved", { exact: true })).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(code) });
    await row.getByRole("button", { name: "Arms" }).click();
    await page.getByRole("button", { name: "Add an arm" }).click();
    const armDialog = page.getByRole("dialog", { name: new RegExp(`Add an arm to ${name}`) });
    await armDialog.getByLabel("Arm").fill("A");
    await armDialog.getByLabel("Capacity").fill("30");
    await armDialog.getByRole("button", { name: "Add arm" }).click();
    await expect(page.getByText("Arm added", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "A", exact: true })).toBeVisible();

    // The same data, read from the backend through the admin's token (the page is the product path).
    const body = await page.evaluate(async () =>
      (await fetch("/api/bff/api/v1/class-levels")).json(),
    );
    const level = (body as Array<{ code: string; id: string }>).find((l) => l.code === code);
    expect(level, "the new level is in GET /class-levels").toBeTruthy();
    const arms = await page.evaluate(
      async (id) => (await fetch(`/api/bff/api/v1/class-levels/${id}/arms`)).json(),
      level?.id,
    );
    expect((arms as Array<{ name: string }>).map((a) => a.name)).toContain("A");
  });

  test("a duplicate code is refused by the backend, and the refusal's code is shown", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/academics/levels");
    await page.getByRole("button", { name: "Add a level" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a class level" });
    await dialog.getByLabel("Code").fill(code);
    await dialog.getByLabel("Name").fill(`${name} again`);
    await dialog.getByLabel("Section").selectOption("Primary");
    await dialog.getByLabel("Order").fill("98");
    await dialog.getByRole("button", { name: "Save level" }).click();
    const alert = dialog.getByRole("alert");
    // The backend refuses a second level with the same name, and the screen shows its code.
    await expect(alert).toContainText("(code academics.duplicate_name)");
  });
});
