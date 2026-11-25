// The platform's SMS top-up against the real backend (ADR 0027, slice 7). It creates its own school for this run, credits it once,
// replays the same Idempotency-Key and checks that nothing is credited twice, and refuses a zero-unit top-up. The school is cancelled
// at the end. The billing sweep is not run here: it acts on every school in the database, so it needs a disposable database.
import { randomUUID } from "node:crypto";
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { createSchool, platformAccessToken } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const headers = (token: string, key?: string) => ({
  "X-Bff-Key": e2e.bffKey,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  ...(key ? { "Idempotency-Key": key } : {}),
});

test.describe("the platform's SMS top-up against the real backend", () => {
  test("a school is credited once, a replayed key credits nothing more, and a zero top-up is refused", async ({
    request,
  }) => {
    const token = await platformAccessToken(request);
    const slug = `sms-${Date.now().toString(36)}`;
    const tenantId = await createSchool(request, token, slug);

    try {
      const key = randomUUID();
      const body = { units: 50, reason: "E2E top-up check" };
      const first = await request.post(url(`/api/v1/platform/tenants/${tenantId}/sms-credits`), {
        headers: headers(token, key),
        data: body,
        failOnStatusCode: false,
      });
      expect(first.status(), await first.text()).toBe(200);
      const wallet = (await first.json()) as { balance: number | string };
      expect(Number(wallet.balance)).toBe(50);

      // The same key with the same request replays the stored answer: the balance is still 50.
      const replay = await request.post(url(`/api/v1/platform/tenants/${tenantId}/sms-credits`), {
        headers: headers(token, key),
        data: body,
        failOnStatusCode: false,
      });
      const replayText = await replay.text();
      expect(replay.status(), replayText).toBe(200);
      expect(replay.headers()["idempotency-replayed"]).toBe("true");
      // The contract: a replay returns the stored answer, the WalletView, not an empty body.
      expect(replayText, "the replay must return the stored WalletView").not.toBe("");
      const again = JSON.parse(replayText) as { balance: number | string };
      expect(Number(again.balance)).toBe(50);

      // Zero units is not a top-up: the contract refuses it, and the balance does not move.
      const zero = await request.post(url(`/api/v1/platform/tenants/${tenantId}/sms-credits`), {
        headers: headers(token, randomUUID()),
        data: { units: 0, reason: "E2E zero check" },
        failOnStatusCode: false,
      });
      expect([400, 422]).toContain(zero.status());
    } finally {
      // Close the run's school. A failure here must not hide the assertions above.
      await request.post(url(`/api/v1/platform/tenants/${tenantId}/cancel`), {
        headers: headers(token, randomUUID()),
        data: { reason: "E2E run cleanup" },
        failOnStatusCode: false,
      });
    }
  });
});
