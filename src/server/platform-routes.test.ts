import { handlePlatformEnrolConfirm } from "./platform-routes";
import { describe, expect, it } from "vitest";
import type { ApiClient } from "./api-client";
import type { BffDeps } from "./bff-proxy";
import {
  handlePlatformLogin,
  handlePlatformLogout,
  handlePlatformMfa,
  handlePlatformProxy,
  validatePlatformSegments,
} from "./platform-routes";

const ORIGIN = "https://greenfield.localhost:3300";

function deps(api: ApiClient): BffDeps {
  return { api, env: { APP_ORIGIN: ORIGIN, TRUSTED_PROXY_COUNT: 0 } } as unknown as BffDeps;
}

function api(answer: { status: number; body?: unknown }): ApiClient {
  return {
    async call() {
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

function post(path: string, body: unknown, extra: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-schoolhub-request": "1",
      ...extra,
    },
    body: JSON.stringify(body),
  });
}

describe("the platform sign-in routes", () => {
  it("refuse a sign-in without the CSRF header", async () => {
    const req = new Request(`${ORIGIN}/api/bff/platform/auth/login`, {
      method: "POST",
      headers: { origin: ORIGIN },
      body: "{}",
    });
    const res = await handlePlatformLogin(req, deps(api({ status: 200 })));
    expect(res.status).toBe(403);
  });

  it("answer with the step only, and never a token", async () => {
    const res = await handlePlatformLogin(
      post("/api/bff/platform/auth/login", { identifier: "staff", password: "pw" }),
      deps(api({ status: 200, body: { mfaRequired: true, mfaToken: "m1", accessToken: "LEAK" } })),
    );
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain("LEAK");
    expect(text).not.toContain("m1");
    expect(JSON.parse(text)).toEqual({ step: "mfa" });
  });

  it("answers a refusal uniformly", async () => {
    const res = await handlePlatformLogin(
      post("/api/bff/platform/auth/login", { identifier: "nobody", password: "x" }),
      deps(api({ status: 401 })),
    );
    expect(res.status).toBe(401);
    expect(JSON.parse(await res.text()).message).toMatch(/did not work/);
  });

  it("refuses a malformed MFA code without calling the API", async () => {
    let called = false;
    const res = await handlePlatformMfa(
      post("/api/bff/platform/auth/mfa/verify", { code: "12" }),
      deps({
        async call() {
          called = true;
          return new Response(null, { status: 200 });
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it("logout clears platform cookies only", () => {
    const res = handlePlatformLogout(
      new Request(`${ORIGIN}/api/bff/platform/auth/logout`, {
        method: "POST",
        headers: { origin: ORIGIN, "x-schoolhub-request": "1" },
      }),
      deps(api({ status: 200 })),
    );
    const cookies = res.headers.getSetCookie().join(";");
    expect(res.status).toBe(204);
    expect(cookies).toContain("sh_p_at=");
    expect(cookies).not.toContain("sh_at=");
  });
});

describe("the platform proxy", () => {
  it("accepts only api/v1/platform paths", () => {
    expect(validatePlatformSegments(["api", "v1", "platform", "tenants"])).toBe(
      "api/v1/platform/tenants",
    );
    expect(validatePlatformSegments(["api", "v1", "students"])).toBeNull();
    expect(validatePlatformSegments(["api", "v1", "platform", ".."])).toBeNull();
  });

  it("requires the platform session, and refuses a school session cookie", async () => {
    const res = await handlePlatformProxy(
      new Request(`${ORIGIN}/api/bff/platform/api/v1/platform/tenants`, {
        headers: { cookie: "sh_at=school-token" },
      }),
      ["api", "v1", "platform", "tenants"],
      deps(api({ status: 200, body: [] })),
    );
    expect(res.status).toBe(401);
  });

  it("forwards the platform cookie and clears the platform session when the API says it has ended", async () => {
    const res = await handlePlatformProxy(
      new Request(`${ORIGIN}/api/bff/platform/api/v1/platform/metrics`, {
        headers: { cookie: "__Host-sh_p_at=platform-token" },
      }),
      ["api", "v1", "platform", "metrics"],
      deps(api({ status: 401 })),
    );
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie().join(";")).toContain("__Host-sh_p_at=");
  });
});

describe("the platform enrolment routes", () => {
  it("refuse an enrolment confirm without the CSRF header", async () => {
    const req = new Request(`${ORIGIN}/api/bff/platform/auth/enrol/confirm`, {
      method: "POST",
      headers: { origin: ORIGIN },
      body: "{}",
    });
    const res = await handlePlatformEnrolConfirm(req, deps(api({ status: 200 })));
    expect(res.status).toBe(403);
  });

  it("return the recovery codes once, and never a token", async () => {
    const res = await handlePlatformEnrolConfirm(
      post(
        "/api/bff/platform/auth/enrol/confirm",
        { code: "123456" },
        { cookie: "__Host-sh_p_enr=e1" },
      ),
      deps(
        api({
          status: 200,
          body: {
            accessToken: "LEAK-A",
            refreshToken: "LEAK-R",
            expiresIn: 900,
            tokenType: "Bearer",
            recoveryCodes: ["RC-1"],
          },
        }),
      ),
    );
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain("LEAK-A");
    expect(text).not.toContain("LEAK-R");
    expect(JSON.parse(text).recoveryCodes).toEqual(["RC-1"]);
    expect(res.headers.getSetCookie().join(";")).toContain("__Host-sh_p_at=LEAK-A");
  });

  it("refuse a malformed enrolment code without calling the API", async () => {
    let called = false;
    const res = await handlePlatformEnrolConfirm(
      post("/api/bff/platform/auth/enrol/confirm", { code: "1" }),
      deps({
        async call() {
          called = true;
          return new Response(null, { status: 200 });
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });
});
