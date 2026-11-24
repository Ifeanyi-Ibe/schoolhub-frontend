// Compliance (ADR 0025, slice 5) against the real backend: reads only. A consent lookup for an identifier that does not exist, and
// the list of data requests. Nothing is recorded, requested, decided or exported.
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const apiHeaders = (token: string) => ({
  "X-Bff-Key": e2e.bffKey,
  "X-Tenant": e2e.schoolSlug,
  Authorization: `Bearer ${token}`,
});

test.describe("compliance reads against the real backend", () => {
  test("the consent lookup answers a page for a person", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const unknownPerson = "0190a6c2-0000-7000-8000-00000000ff99";
    const res = await request.get(
      url(
        `/api/v1/compliance/consents?subjectType=Student&subjectId=${unknownPerson}&page=1&pageSize=20`,
      ),
      {
        headers: apiHeaders(admin),
        failOnStatusCode: false,
      },
    );
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("the data requests answer a page", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const res = await request.get(url("/api/v1/compliance/data-requests?page=1&pageSize=20"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });
});
