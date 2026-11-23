// The admin dashboard (ADR 0025, slice 4) against the real backend: a read, for the school's current term. The seed may have no
// current term; the check then skips with that reason, and creates nothing.
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const apiHeaders = (token: string) => ({
  "X-Bff-Key": e2e.bffKey,
  "X-Tenant": e2e.schoolSlug,
  Authorization: `Bearer ${token}`,
});

test.describe("the admin dashboard against the real backend", () => {
  test("the dashboard answers for the current term", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const sessions = (await (
      await request.get(url("/api/v1/sessions"), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string; isCurrent: boolean }>;
    const session = sessions.find((s) => s.isCurrent);
    test.skip(!session, "the seed has no current session (see OPEN_ITEMS)");
    const terms = (await (
      await request.get(url(`/api/v1/sessions/${session?.id}/terms`), {
        headers: apiHeaders(admin),
      })
    ).json()) as Array<{ id: string; isCurrent: boolean }>;
    const term = terms.find((t) => t.isCurrent);
    test.skip(!term, "the seed has no current term (see OPEN_ITEMS)");
    const res = await request.get(url(`/api/v1/dashboard/admin?termId=${term?.id}`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { enrolment: unknown; fees: unknown; results: unknown };
    expect(body.enrolment).toBeTruthy();
    expect(body.fees).toBeTruthy();
    expect(body.results).toBeTruthy();
  });
});
