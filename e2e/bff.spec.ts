// BFF integration: the real route handlers, running in `next dev`, against the fake API.
import { test, expect } from "./fixtures";
import { COOKIE, SCHOOL_ORIGIN } from "./origin";
import { FAKE_API_URL, TEST_BFF_KEY, fakeJwt } from "./fake-api";
import { SCHOOL } from "./api-host";

test.use(SCHOOL);

const CSRF = { "X-SchoolHub-Request": "1" };
const IDEMPOTENCY_KEY = "0190a6c2-7d4e-7000-8000-123456789abc";

// A body the contract accepts for POST /api/v1/students (RegisterStudentRequest, docs/openapi/v1.json).
// The test double rejects any request that does not match, so tests send only valid bodies.
const validStudent = (overrides: Record<string, unknown> = {}) => ({
  admissionNo: null,
  firstName: "Ada",
  middleName: null,
  lastName: "Okafor",
  gender: "Female",
  dateOfBirth: "2015-03-09",
  address: null,
  admittedOn: "2026-09-07",
  sessionId: "0190a6c2-0000-7000-8000-000000000001",
  classArmId: "0190a6c2-0000-7000-8000-000000000002",
  medicalNotes: null,
  specialNeedsNotes: null,
  guardians: [],
  ...overrides,
});
const ORIGIN = { Origin: SCHOOL_ORIGIN };

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
    expect(seen["x-bff-key"]).toBe(TEST_BFF_KEY);
    expect(seen["x-tenant"]).toBe("greenfield");
    expect(seen["x-forwarded-for"]).toBeUndefined(); // no trusted proxy in this test setup
    expect(seen["x-client-user-agent"]).toBe("Mozilla/5.0 test");
    expect(seen.cookie).toBeUndefined();
  });

  test("uses the access token from the cookie and never echoes it back", async ({ request }) => {
    const token = fakeJwt("fresh", 900);
    const res = await request.get("/api/bff/api/v1/me", {
      headers: { Cookie: `${COOKIE.at}=${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).not.toContain(token);
    expect(res.headers()["cache-control"]).toBe("no-store");
  });

  test("refreshes a near-expiry token and sets rotated cookies, httpOnly and SameSite=Lax", async ({
    request,
  }) => {
    const res = await request.get("/api/bff/api/v1/me", {
      headers: { Cookie: `${COOKIE.at}=stale-not-a-jwt; ${COOKIE.rt}=rt:ok:1` },
    });
    expect(res.status()).toBe(200);
    const cookies = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    expect(
      cookies.some(
        (c) =>
          c.startsWith(`${COOKIE.at}=`) && c.includes("HttpOnly") && c.includes("SameSite=Lax"),
      ),
    ).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${COOKIE.rt}=rt:ok:2`))).toBe(true);
  });

  test("survives the backend's 409 auth.refresh_in_flight by waiting and retrying", async ({
    request,
  }) => {
    const res = await request.get("/api/bff/api/v1/me", {
      headers: { Cookie: `${COOKIE.at}=stale; ${COOKIE.rt}=race` },
    });
    expect(res.status()).toBe(200);
  });

  test("clears the session when the refresh token is dead", async ({ request }) => {
    const res = await request.get("/api/bff/api/v1/me", {
      headers: { Cookie: `${COOKIE.at}=stale; ${COOKIE.rt}=dead` },
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
    // A unique probe per run: other tests post to the same path.
    const probe = `probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await request.post(`/api/bff/api/v1/students?probe=${probe}`, {
      data: validStudent({ lastName: `Probe${probe.slice(-12)}` }),
      headers: {
        ...CSRF,
        ...ORIGIN,
        Cookie: `${COOKIE.at}=${fakeJwt("ok")}`,
        "Idempotency-Key": IDEMPOTENCY_KEY,
      },
    });
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({
      capacityWarning: false,
      student: { firstName: "Ada" },
    });
    const seen = await (
      await request.get(
        `${FAKE_API_URL}/__received?path=${encodeURIComponent(`/api/v1/students?probe=${probe}`)}`,
      )
    ).json();
    expect(seen["idempotency-key"]).toBe(IDEMPOTENCY_KEY);
  });

  test("relays a 402 billing.suspended problem unchanged", async ({ request }) => {
    const res = await request.post("/api/bff/api/v1/students", {
      data: validStudent(),
      headers: {
        ...CSRF,
        ...ORIGIN,
        Cookie: `${COOKIE.at}=${fakeJwt("suspended")}`,
        "Idempotency-Key": IDEMPOTENCY_KEY,
      },
      failOnStatusCode: false,
    });
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
      headers: { ...CSRF, ...ORIGIN, Cookie: `${COOKIE.at}=${fakeJwt("ok")}` },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect(res.headers()["content-disposition"]).toBe('attachment; filename="receipt-9.pdf"');
    expect(res.headers()["cache-control"]).toBe("no-store");
    expect(res.headers()["set-cookie"]).toBeUndefined();
    expect(await res.text()).toBe("%PDF-1.7 fake");
  });

  test("refuses plain http and unlisted hosts for absolute downloads in production", async ({
    request,
  }) => {
    const plainHttp = await request.post("/api/bff/download", {
      data: { url: `${FAKE_API_URL}/export.csv` },
      headers: { ...CSRF, ...ORIGIN },
      failOnStatusCode: false,
    });
    expect(plainHttp.status()).toBe(400);

    const refused = await request.post("/api/bff/download", {
      data: { url: "http://169.254.169.254/latest/meta-data" },
      headers: { ...CSRF, ...ORIGIN },
      failOnStatusCode: false,
    });
    expect(refused.status()).toBe(400);
  });
});
