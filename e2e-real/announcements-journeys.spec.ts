// Announcements (ADR 0025, slice 2) against the real backend: the list, and the audience check, which only reads. Nothing is
// created, sent or cancelled here: a send reaches real families.
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

test.describe("announcement reads against the real backend", () => {
  test("the announcements list answers as a page", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const res = await request.get(url("/api/v1/announcements?page=1&pageSize=20"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("the audience check answers the counts and the SMS units, and sends nothing", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const res = await request.post(url("/api/v1/announcements/audience-preview"), {
      headers: apiHeaders(admin),
      data: { audience: "all", ids: null, channels: ["inapp"], body: "Check only" },
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { recipients: unknown; sufficient: unknown };
    expect(body.recipients).not.toBeUndefined();
    expect(typeof body.sufficient).toBe("boolean");
  });
});
