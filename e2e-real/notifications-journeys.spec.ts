// Notification templates, the message log, statistics and the SMS wallet (ADR 0025, slice 3) against the real backend: reads only.
// Nothing is edited, retried or reset here: those change the messages a real family receives.
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const apiHeaders = (token: string) => ({
  "X-Bff-Key": e2e.bffKey,
  "X-Tenant": e2e.schoolSlug,
  Authorization: `Bearer ${token}`,
});

test.describe("notification reads against the real backend", () => {
  test("the templates answer as a list, each with its variables", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const res = await request.get(url("/api/v1/notifications/templates"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as Array<{ variables: unknown }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((t) => Array.isArray(t.variables))).toBe(true);
  });

  test("the message log, the statistics and the wallet answer", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const log = await request.get(url("/api/v1/notifications/messages?page=1&pageSize=20"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(log.status(), await log.text()).toBe(200);
    const stats = await request.get(url("/api/v1/notifications/stats?days=30"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(stats.status(), await stats.text()).toBe(200);
    const wallet = await request.get(url("/api/v1/notifications/sms-wallet"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(wallet.status(), await wallet.text()).toBe(200);
    const w = (await wallet.json()) as { available: unknown };
    expect(w.available).not.toBeUndefined();
  });
});
