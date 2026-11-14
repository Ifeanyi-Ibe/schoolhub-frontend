// BFF integration: the real route handlers, running in `next dev`, against the fake API.
import { expect, test } from "@playwright/test";
import { FAKE_API_URL, fakeJwt } from "./fake-api";

const CSRF = { "X-SchoolHub-Request": "1" };
const ORIGIN = { Origin: "http://localhost:3000" };

test.describe("BFF", () => {
  test("health is public and reveals nothing", async ({ request }) => {
    const res = await request.get("/api/bff/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers()["cache-control"]).toBe("no-store");
  });

  test("forwards the BFF key, the host's tenant and the client IP; ignores spoofed tenant headers", async ({
    request,
  }) => {
    // A unique probe per run: the two browser projects share one fake API.
    const probe = `probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await request.get(`/api/bff/api/v1/me?probe=${probe}`, {
      headers: {
        "X-Tenant": "victim-school",
        "X-Forwarded-For": "9.9.9.9",
        "User-Agent": "Mozilla/5.0 test",
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401); // anonymous, so the fake API refuses
    const key = encodeURIComponent(`/api/v1/me?probe=${probe}`);
    const seen = await (await request.get(`${FAKE_API_URL}/__received?path=${key}`)).json();
    expect(seen["x-bff-key"]).toBe("e2e-bff-key-0000000001");
    expect(seen["x-tenant"]).toBe("greenfield");
    expect(seen["x-forwarded-for"]).toBeUndefined(); // no trusted proxy in this test setup
    expect(seen["x-client-user-agent"]).toBe("Mozilla/5.0 test");
    expect(seen.cookie).toBeUndefined();
  });

  test("uses the access token from the cookie and never echoes it back", async ({ request }) => {
    const token = fakeJwt("fresh", 900);
    const res = await request.get("/api/bff/api/v1/me", { headers: { Cookie: `sh_at=${token}` } });
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).not.toContain(token);
    expect(res.headers()["cache-control"]).toBe("no-store");
  });

  test("refreshes a near-expiry token and sets rotated cookies, httpOnly and SameSite=Lax", async ({
    request,
  }) => {
    const res = await request.get("/api/bff/api/v1/me", {
      headers: { Cookie: "sh_at=stale-not-a-jwt; sh_rt=rt-1" },
    });
    expect(res.status()).toBe(200);
    const cookies = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    expect(
      cookies.some(
        (c) => c.startsWith("sh_at=") && c.includes("HttpOnly") && c.includes("SameSite=Lax"),
      ),
    ).toBe(true);
    expect(cookies.some((c) => c.startsWith("sh_rt=rotated-rt-1"))).toBe(true);
  });

  test("survives the backend's 409 auth.refresh_in_flight by waiting and retrying", async ({
    request,
  }) => {
    const res = await request.get("/api/bff/api/v1/me", {
      headers: { Cookie: "sh_at=stale; sh_rt=race" },
    });
    expect(res.status()).toBe(200);
  });

  test("clears the session when the refresh token is dead", async ({ request }) => {
    const res = await request.get("/api/bff/api/v1/me", {
      headers: { Cookie: "sh_at=stale; sh_rt=dead" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
    const cookies = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    expect(cookies.length).toBeGreaterThanOrEqual(2);
    expect(cookies.every((c) => c.includes("Max-Age=0"))).toBe(true);
  });

  test("refuses a mutation without the CSRF header, or from another origin", async ({
    request,
  }) => {
    const none = await request.post("/api/bff/api/v1/students", {
      data: { a: 1 },
      headers: ORIGIN,
      failOnStatusCode: false,
    });
    expect(none.status()).toBe(403);
    expect(((await none.json()) as { code: string }).code).toBe("bff.csrf_header_missing");

    const cross = await request.post("/api/bff/api/v1/students", {
      data: { a: 1 },
      headers: { ...CSRF, Origin: "https://evil.example" },
      failOnStatusCode: false,
    });
    expect(cross.status()).toBe(403);
    expect(((await cross.json()) as { code: string }).code).toBe("bff.origin_mismatch");
  });

  test("passes a same-origin mutation through with its body and Idempotency-Key", async ({
    request,
  }) => {
    const res = await request.post("/api/bff/api/v1/students", {
      data: { firstName: "Ada" },
      headers: { ...CSRF, ...ORIGIN, "Idempotency-Key": "0190a6c2-7d4e-7000-8000-123456789abc" },
    });
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({ created: true, echo: { firstName: "Ada" } });
    const seen = await (
      await request.get(`${FAKE_API_URL}/__received?path=/api/v1/students`)
    ).json();
    expect(seen["idempotency-key"]).toBe("0190a6c2-7d4e-7000-8000-123456789abc");
  });

  test("relays a 402 billing.suspended problem unchanged", async ({ request }) => {
    const res = await request.get("/api/bff/api/v1/billing/suspended", { failOnStatusCode: false });
    expect(res.status()).toBe(402);
    expect(await res.json()).toMatchObject({ code: "billing.suspended" });
  });

  test("refuses paths outside api/v1", async ({ request }) => {
    const res = await request.get("/api/bff/admin/secret", { failOnStatusCode: false });
    expect(res.status()).toBe(404);
  });

  test("streams a relative download with attachment disposition and no-store, and never the upstream cookies", async ({
    request,
  }) => {
    const res = await request.post("/api/bff/download", {
      data: { path: "api/v1/payments/9/receipt" },
      headers: { ...CSRF, ...ORIGIN },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect(res.headers()["content-disposition"]).toBe('attachment; filename="receipt-9.pdf"');
    expect(res.headers()["cache-control"]).toBe("no-store");
    expect(res.headers()["set-cookie"]).toBeUndefined();
    expect(await res.text()).toBe("%PDF-1.7 fake");
  });

  test("fetches an allow-listed absolute URL without credentials, and refuses other hosts", async ({
    request,
  }) => {
    const ok = await request.post("/api/bff/download", {
      data: { url: `${FAKE_API_URL}/export.csv` },
      headers: { ...CSRF, ...ORIGIN },
    });
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toBe("text/csv");
    const seen = await (await request.get(`${FAKE_API_URL}/__received?path=/export.csv`)).json();
    expect(seen["x-bff-key"]).toBeUndefined();
    expect(seen.authorization).toBeUndefined();

    const refused = await request.post("/api/bff/download", {
      data: { url: "http://169.254.169.254/latest/meta-data" },
      headers: { ...CSRF, ...ORIGIN },
      failOnStatusCode: false,
    });
    expect(refused.status()).toBe(400);
  });
});
