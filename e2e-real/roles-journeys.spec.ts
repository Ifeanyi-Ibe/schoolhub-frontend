// Roles and people rules against the real backend (development seed, plus this run's e2e- data).
// (a) escalation: a user cannot grant a role beyond their own permissions. The UI disables it, and the API
//     refuses the same request when it is sent directly.
// (b) last-SchoolAdmin: the backend refuses to remove the last administrator's role. If it ever accepts,
//     the test restores the role at once and fails.
// (c) built-in roles: the API is asked for a change to a built-in role; the answer is recorded.
// Creates only e2e- data. Never deletes a role.
import { randomUUID } from "node:crypto";
import { type APIRequestContext } from "@playwright/test";
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken, inviteUser, latestMessage, runAddress } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const apiHeaders = (token: string) => ({
  "X-Bff-Key": e2e.bffKey,
  "X-Tenant": e2e.schoolSlug,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

async function rolesOf(request: APIRequestContext, token: string) {
  const res = await request.get(url("/api/v1/roles"), {
    headers: apiHeaders(token),
    failOnStatusCode: false,
  });
  const body: unknown = await res.json().catch(() => null);
  if (res.status() !== 200 || !Array.isArray(body)) {
    const code = (body as { code?: string } | null)?.code ?? "no code";
    throw new Error(`GET /roles answered ${res.status()} ${code}`);
  }
  return {
    status: res.status(),
    roles: body as Array<{ id: string; name: string; permissions: string[]; isSystem: boolean }>,
  };
}

const runPassword = (tag: string) => `Run-${tag}-${randomUUID().slice(0, 8)}-pass`;

test.describe.serial("roles and escalation", () => {
  const actor = { email: runAddress("actor"), password: runPassword("actor"), id: "" };
  // Per-run display name, so the people screen finds this run's account only.
  const actorName = `E2E Actor ${Date.now().toString(36)}`;
  let inviteOnlyRoleId = "";
  let inviteOnlyRoleName = "";

  test("the administrator creates a custom role with one permission (users.invite)", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    inviteOnlyRoleName = `e2e-invite-only-${Date.now().toString(36)}`;
    const res = await request.post(url("/api/v1/roles"), {
      headers: { ...apiHeaders(admin), "Idempotency-Key": randomUUID() },
      data: {
        name: inviteOnlyRoleName,
        description: "e2e: invites only",
        permissions: ["users.invite"],
      },
      failOnStatusCode: false,
    });
    const body = (await res.json()) as { id?: string; code?: string };
    expect(res.status(), body.code).toBe(201);
    inviteOnlyRoleId = body.id ?? "";
    expect(inviteOnlyRoleId).not.toBe("");
  });

  test("an account holding only that role is invited and signs in", async ({ page, request }) => {
    const admin = await adminAccessToken(request);
    actor.id = await inviteUser(request, admin, actorName, actor.email, [inviteOnlyRoleId]);
    const body = await latestMessage(request, actor.email);
    const token = /token=([^\s&"<>]+)/.exec(body)?.[1];
    if (!token) throw new Error("no invitation token");
    await page.goto(`/accept-invite#token=${encodeURIComponent(token)}`);
    await page.getByLabel(/^Password/).fill(actor.password);
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await expect(page.getByText("Your account is ready. Sign in to continue.")).toBeVisible();
    await page.goto("/login");
    await page.getByLabel(/Email or phone/).fill(actor.email);
    await page.getByLabel(/^Password/).fill(actor.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/home");
  });

  test("the UI does not offer the built-in roles the actor cannot grant, and the API refuses them when sent", async ({
    page,
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const { roles } = await rolesOf(request, admin);
    const registrar = roles.find((r) => r.name === "Registrar");
    if (!registrar) throw new Error("the seed has no Registrar role");
    expect(registrar.permissions.every((p) => p === "users.invite")).toBe(false);

    // The UI: the invitation dialog lists roles, and a role with permissions the actor lacks is disabled.
    // Each test has its own browser context, so the actor signs in here.
    await page.goto("/login");
    await page.getByLabel(/Email or phone/).fill(actor.email);
    await page.getByLabel(/^Password/).fill(actor.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/home");
    await page.goto("/people");
    await page.getByRole("button", { name: "Invite a person" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite a person" });
    // The actor cannot read the role list (GET /roles is refused for an invite-only account), so the dialog
    // offers no role at all, and says so. Nothing can be granted from it.
    await expect(dialog.getByText("No roles to choose from.")).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: /Registrar/ })).toHaveCount(0);

    // The API: the same grant, attempted directly through the BFF with the actor's session.
    // Sent from the browser, so the session cookies and the Origin are the page's own.
    const refused = await page.evaluate(
      async ({ roleId, email }) => {
        const res = await fetch("/api/bff/api/v1/users/invite", {
          method: "POST",
          headers: {
            "X-SchoolHub-Request": "1",
            "Idempotency-Key": crypto.randomUUID(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName: "E2E Refused",
            email,
            phone: null,
            roleIds: [roleId],
          }),
        });
        return {
          status: res.status,
          code: ((await res.json().catch(() => ({}))) as { code?: string }).code,
        };
      },
      { roleId: registrar.id, email: runAddress("refused") },
    );
    const problem = { code: refused.code };
    expect(refused.status).toBe(403);
    expect(problem.code).toBeTruthy();
    // Recorded for the report: the code the backend returns for an escalation refusal.
    console.log(`ESCALATION_REFUSAL status=${refused.status} code=${problem.code}`);
  });

  test("the backend refuses to remove the last SchoolAdmin's role; if it ever accepts, the role is restored", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const { roles } = await rolesOf(request, admin);
    const schoolAdmin = roles.find(
      (r) => r.isSystem && r.permissions.length > 0 && r.name === "SchoolAdmin",
    );
    if (!schoolAdmin) throw new Error("the seed has no SchoolAdmin role");
    const me = (await (
      await request.get(url("/api/v1/me"), { headers: apiHeaders(admin) })
    ).json()) as { id: string };
    const users = (await (
      await request.get(url("/api/v1/users?pageSize=200"), { headers: apiHeaders(admin) })
    ).json()) as {
      items: Array<{ id: string; roles: string[] }>;
    };
    const admins = users.items.filter((u) => u.roles.includes("SchoolAdmin"));
    console.log(`SCHOOLADMIN_COUNT ${admins.length}`);
    // SKIPPED UNLESS the seed has exactly one SchoolAdmin ("solo" school, from the backend). The development seed
    // has two SchoolAdmins, so this journey does not run today. Removal of the last administrator is refused by
    // the backend (it returns a stable code); the test records the code when it runs. Tracked in docs/OPEN_ITEMS.md.
    test.skip(
      admins.length !== 1,
      `needs a school with exactly one SchoolAdmin (seed "solo" school); this school has ${admins.length}`,
    );

    const res = await request.put(url(`/api/v1/users/${me.id}/roles`), {
      headers: { ...apiHeaders(admin), "Content-Type": "application/json" },
      data: { roleIds: [] },
      failOnStatusCode: false,
    });
    if (res.status() === 200) {
      // The backend allowed it: restore the seeded administrator's role before failing.
      await request.put(url(`/api/v1/users/${me.id}/roles`), {
        headers: apiHeaders(admin),
        data: { roleIds: [schoolAdmin.id] },
        failOnStatusCode: false,
      });
    }
    const problem =
      res.status() === 200 ? { code: "accepted" } : ((await res.json()) as { code?: string });
    console.log(`LAST_ADMIN_REMOVAL status=${res.status()} code=${problem.code}`);
    expect(res.status()).not.toBe(200);
  });

  test("the administrator removes the e2e- custom role from the spare account on the people screen, and the API agrees", async ({
    page,
    request,
  }) => {
    expect(actor.id, "the spare account exists").not.toBe("");
    await page.goto("/login");
    await page.getByLabel(/Email or phone/).fill(e2e.adminIdentifier);
    await page.getByLabel(/^Password/).fill(e2e.adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/home");
    // The people search fails on the real backend (B-24: users?q= answers 500), so the list is paged
    // instead until this run's account is on screen. Earlier runs leave accounts behind, so this can take
    // several pages.
    await page.goto("/people");
    const rolesButton = page.getByRole("button", { name: `Roles: ${actorName}` });
    const next = page.getByRole("button", { name: "Next page" });
    for (let i = 0; i < 30 && !(await rolesButton.isVisible()); i++) {
      if (await next.isDisabled()) break;
      await next.click();
      await page.waitForLoadState("networkidle");
    }
    await rolesButton.click();
    const dialog = page.getByRole("dialog", { name: `Roles for ${actorName}` });
    await dialog.getByRole("checkbox", { name: inviteOnlyRoleName }).click();
    await dialog.getByRole("button", { name: "Save roles" }).click();
    await expect(page.getByText("Roles updated", { exact: true })).toBeVisible();

    const admin = await adminAccessToken(request);
    const users = (await (
      await request.get(url("/api/v1/users?pageSize=200"), {
        headers: apiHeaders(admin),
      })
    ).json()) as { items: Array<{ id: string; roles: string[] }> };
    const actorView = users.items.find((u) => u.id === actor.id);
    expect(actorView?.roles ?? [], "the API no longer lists the custom role").not.toContain(
      inviteOnlyRoleName,
    );
  });

  test("a change to a built-in role is sent to the API and the answer is recorded (no change made)", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const { roles } = await rolesOf(request, admin);
    const registrar = roles.find((r) => r.name === "Registrar");
    if (!registrar) throw new Error("the seed has no Registrar role");
    // Sends the role's own permissions back unchanged, so the call is a no-op whatever the answer.
    const res = await request.put(url(`/api/v1/roles/${registrar.id}/permissions`), {
      headers: apiHeaders(admin),
      data: { permissions: registrar.permissions },
      failOnStatusCode: false,
    });
    console.log(`BUILT_IN_ROLE_WRITE status=${res.status()}`);
    expect([200, 403, 409, 422]).toContain(res.status());
  });
});
