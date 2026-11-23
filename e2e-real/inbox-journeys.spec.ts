// The staff inbox and preferences (ADR 0025) against the real backend: the reads the screen depends on. Nothing is marked read and
// no preference is changed, because those change a real user's messages and settings.
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const apiHeaders = (token: string) => ({
  "X-Bff-Key": e2e.bffKey,
  "X-Tenant": e2e.schoolSlug,
  Authorization: `Bearer ${token}`,
});

test.describe("inbox reads against the real backend", () => {
  test("the inbox answers with its unread count and a page of messages", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const res = await request.get(url("/api/v1/me/notifications?page=1&pageSize=20"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as {
      unreadCount: unknown;
      items: { items: unknown[]; totalCount: unknown };
    };
    expect(body.unreadCount).not.toBeUndefined();
    expect(Array.isArray(body.items.items)).toBe(true);
  });

  test("the notification preferences answer as a list with the required ones marked", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const res = await request.get(url("/api/v1/me/notification-preferences"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { items: Array<{ locked: boolean }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.every((i) => typeof i.locked === "boolean")).toBe(true);
  });
});
