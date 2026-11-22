// Score sheets (ADR 0022, slice 1) against the real backend: the reads the screen depends on, answered as the contract says.
// It opens no sheet and changes nothing: opening a sheet needs a teacher's assignment, which the seed does not give the
// administrator, and the browser journeys cover the workflow against the test double.
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const apiHeaders = (token: string) => ({
  "X-Bff-Key": e2e.bffKey,
  "X-Tenant": e2e.schoolSlug,
  Authorization: `Bearer ${token}`,
});

test.describe("score sheets reads against the real backend", () => {
  test("the default assessment scheme has components with maximums that add to its total", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const res = await request.get(url("/api/v1/assessment-schemes"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    const schemes = (await res.json()) as Array<{
      isDefault: boolean;
      total: number | string;
      components: Array<{ maxScore: number | string }>;
    }>;
    const defaults = schemes.filter((s) => s.isDefault);
    expect(defaults.length, "exactly one default scheme").toBe(1);
    const [scheme] = defaults;
    expect(scheme?.components.length ?? 0).toBeGreaterThan(0);
    const sum = scheme?.components.reduce((acc, c) => acc + Number(c.maxScore), 0) ?? 0;
    expect(sum).toBe(Number(scheme?.total));
  });

  test("the signed-in administrator's assignments answer, with a session", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const res = await request.get(url("/api/v1/me/assignments"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { sessionId: string | null; assignments: unknown[] };
    expect(Array.isArray(body.assignments)).toBe(true);
  });

  test("a score sheet that does not exist is answered 404, which the screen reads as no sheet yet", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const zero = "00000000-0000-0000-0000-000000000000";
    const res = await request.get(
      url(`/api/v1/assessment/score-sheets?termId=${zero}&classArmId=${zero}&subjectId=${zero}`),
      { headers: apiHeaders(admin), failOnStatusCode: false },
    );
    expect(res.status(), await res.text()).toBe(404);
  });
});
