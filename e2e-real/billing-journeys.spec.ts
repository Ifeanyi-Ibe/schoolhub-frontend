// The school's subscription and invoices (ADR 0025, slice 6) against the real backend: reads only. Nothing is paid: a payment moves
// real money, and it is not tested against the real backend.
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const apiHeaders = (token: string) => ({
  "X-Bff-Key": e2e.bffKey,
  "X-Tenant": e2e.schoolSlug,
  Authorization: `Bearer ${token}`,
});

test.describe("billing reads against the real backend", () => {
  test("the subscription answers with its plan and what is owed", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const res = await request.get(url("/api/v1/billing/subscription"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { planPriceKobo: unknown; outstandingKobo: unknown };
    expect(body.planPriceKobo).not.toBeUndefined();
    expect(body.outstandingKobo).not.toBeUndefined();
  });

  test("the invoices answer as a page", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const res = await request.get(url("/api/v1/billing/invoices?page=1&pageSize=20"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });
});
