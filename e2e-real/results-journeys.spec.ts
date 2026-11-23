// Results, report cards and amendments (ADR 0024) against the real backend: the reads the screens depend on, answered as the contract
// says. Nothing is computed, generated, published or amended here: those change the school's results and the families' documents.
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const apiHeaders = (token: string) => ({
  "X-Bff-Key": e2e.bffKey,
  "X-Tenant": e2e.schoolSlug,
  Authorization: `Bearer ${token}`,
});

test.describe("results reads against the real backend", () => {
  test("the domain traits answer as a list", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const res = await request.get(url("/api/v1/domain-traits"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test("the current term's class broadsheet answers as a list, and the report cards for it too", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const sessions = (await (
      await request.get(url("/api/v1/sessions"), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string }>;
    const sessionId = sessions[0]?.id ?? "";
    expect(sessionId, "the seed has a session").not.toBe("");
    const terms = (await (
      await request.get(url(`/api/v1/sessions/${sessionId}/terms`), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string; isCurrent: boolean }>;
    const termId = (terms.find((t) => t.isCurrent) ?? terms[0])?.id ?? "";
    // The seed has no term for its session; the attendance journey creates one. This read-only check does not create records.
    test.skip(termId === "", "the seed has no term for its session (see OPEN_ITEMS)");
    const levels = (await (
      await request.get(url("/api/v1/class-levels"), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string }>;
    const arms = (await (
      await request.get(url(`/api/v1/class-levels/${levels[0]?.id ?? ""}/arms`), {
        headers: apiHeaders(admin),
      })
    ).json()) as Array<{ id: string }>;
    const classArmId = arms[0]?.id ?? "";
    expect(classArmId, "the seed has an arm").not.toBe("");

    const broadsheet = await request.get(
      url(`/api/v1/assessment/results/class?termId=${termId}&classArmId=${classArmId}`),
      {
        headers: apiHeaders(admin),
        failOnStatusCode: false,
      },
    );
    expect(broadsheet.status(), await broadsheet.text()).toBe(200);
    expect(Array.isArray(await broadsheet.json())).toBe(true);

    const cards = await request.get(
      url(`/api/v1/report-cards?termId=${termId}&classArmId=${classArmId}`),
      {
        headers: apiHeaders(admin),
        failOnStatusCode: false,
      },
    );
    expect(cards.status(), await cards.text()).toBe(200);
    expect(Array.isArray(await cards.json())).toBe(true);
  });

  test("a job that does not exist is answered 404, which the screen reports as a failure", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const zero = "00000000-0000-0000-0000-000000000000";
    const res = await request.get(url(`/api/v1/assessment/jobs/${zero}`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(404);
  });
});
