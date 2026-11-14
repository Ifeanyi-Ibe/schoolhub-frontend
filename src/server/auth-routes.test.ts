import { describe, expect, it, vi } from "vitest";
import {
  handleChangePassword,
  handleEnrollmentConfirm,
  handleEnrollmentStart,
  handleForgotPassword,
  handleLogin,
  handleLogout,
  handleMfaVerify,
} from "./auth-routes";
import type { BffDeps } from "./bff-proxy";
import { fakeApi, json, jwtWithExp, NOW } from "./test-helpers";

const APP = "https://greenfield.schoolhub.example";
const CSRF = { "X-SchoolHub-Request": "1", Origin: APP, "Content-Type": "application/json" };

function deps(api: ReturnType<typeof fakeApi>): BffDeps {
  return {
    env: {
      APP_BASE_DOMAIN: "schoolhub.example",
      APP_ORIGIN: APP,
      TRUSTED_PROXY_COUNT: 0,
      DEV_TENANT_SLUG: undefined,
      NODE_ENV: "production",
      DOWNLOAD_ALLOWED_HOSTS: [],
      REFRESH_GRACE_SECONDS: 10,
    },
    api,
    fetchExternal: vi.fn() as unknown as typeof fetch,
    now: () => NOW,
    sleep: async () => undefined,
    random: () => 0.5,
    logger: () => undefined,
  };
}

function post(
  path: string,
  body: unknown,
  opts: { headers?: Record<string, string>; raw?: string } = {},
) {
  return new Request(`${APP}${path}`, {
    method: "POST",
    headers: { host: "greenfield.schoolhub.example", ...CSRF, ...(opts.headers ?? {}) },
    body: opts.raw ?? JSON.stringify(body),
  });
}

const setCookies = (res: Response) => res.headers.getSetCookie();
const tokenFor = (label: string) => jwtWithExp(NOW + 900_000 + label.length);

describe("login", () => {
  it("refuses a cross-site POST before anything else", async () => {
    const api = fakeApi(() => json(200, {}));
    const res = await handleLogin(
      post("/api/bff/auth/login", {}, { headers: { Origin: "https://evil.example" } }),
      deps(api),
    );
    expect(res.status).toBe(403);
    expect(api.calls).toHaveLength(0);
  });

  it("refuses unknown fields and tells the form which field is wrong", async () => {
    const api = fakeApi(() => json(200, {}));
    const res = await handleLogin(
      post("/api/bff/auth/login", { identifier: "a@b.example", password: "x", role: "admin" }),
      deps(api),
    );
    expect(res.status).toBe(400);
    expect(api.calls).toHaveLength(0);
  });

  it("sets __Host- session cookies and returns only a status (no token in the body)", async () => {
    const access = tokenFor("a");
    const api = fakeApi(() =>
      json(200, {
        accessToken: access,
        refreshToken: "r-1",
        expiresIn: 900,
        mfaRequired: false,
        mfaToken: null,
        mfaEnrollmentRequired: false,
        enrollmentToken: null,
      }),
    );
    const res = await handleLogin(
      post("/api/bff/auth/login", {
        identifier: "parent@example.test",
        password: "a-long-password",
      }),
      deps(api),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('{"status":"signed_in"}');
    expect(body).not.toContain(access);
    expect(body).not.toContain("r-1");
    const cookies = setCookies(res);
    const at = cookies.find((c) => c.startsWith("__Host-sh_at="));
    expect(at).toMatch(/HttpOnly/);
    expect(at).toMatch(/Secure/);
    expect(at).toMatch(/SameSite=Lax/);
    expect(at).toMatch(/Path=\//);
    expect(at).not.toMatch(/Domain=/i);
    expect(cookies.some((c) => c.startsWith("__Host-sh_rt=r-1"))).toBe(true);
  });

  it("answers mfa_required with an httpOnly challenge cookie and no session", async () => {
    const api = fakeApi(() =>
      json(200, {
        accessToken: null,
        refreshToken: null,
        expiresIn: null,
        mfaRequired: true,
        mfaToken: "mfa-challenge-123456",
        mfaEnrollmentRequired: false,
        enrollmentToken: null,
      }),
    );
    const res = await handleLogin(
      post("/api/bff/auth/login", {
        identifier: "staff@example.test",
        password: "a-long-password",
      }),
      deps(api),
    );
    expect(await res.json()).toEqual({ status: "mfa_required" });
    const cookies = setCookies(res);
    expect(
      cookies.some(
        (c) => c.startsWith("__Host-sh_mfa=mfa-challenge-123456") && c.includes("HttpOnly"),
      ),
    ).toBe(true);
    expect(cookies.some((c) => c.startsWith("__Host-sh_at="))).toBe(false);
  });

  it("routes an account that must enrol MFA, without issuing a session", async () => {
    const api = fakeApi(() =>
      json(200, {
        accessToken: null,
        refreshToken: null,
        expiresIn: null,
        mfaRequired: false,
        mfaToken: null,
        mfaEnrollmentRequired: true,
        enrollmentToken: "enr-token-abcdef",
      }),
    );
    const res = await handleLogin(
      post("/api/bff/auth/login", { identifier: "new@example.test", password: "a-long-password" }),
      deps(api),
    );
    expect(await res.json()).toEqual({ status: "enrollment_required" });
    expect(setCookies(res).some((c) => c.startsWith("__Host-sh_enr=enr-token-abcdef"))).toBe(true);
  });

  it("relays the upstream error unchanged, with its code and Retry-After", async () => {
    const api = fakeApi(() =>
      json(
        429,
        { code: "auth.account_locked", title: "Too many attempts" },
        { "retry-after": "30" },
      ),
    );
    const res = await handleLogin(
      post("/api/bff/auth/login", {
        identifier: "someone@example.test",
        password: "a-long-password",
      }),
      deps(api),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.json()).toMatchObject({ code: "auth.account_locked" });
  });

  it("refuses a 200 that carries no usable session or challenge", async () => {
    const api = fakeApi(() =>
      json(200, {
        accessToken: null,
        refreshToken: null,
        expiresIn: null,
        mfaRequired: false,
        mfaEnrollmentRequired: false,
      }),
    );
    const res = await handleLogin(
      post("/api/bff/auth/login", { identifier: "x@example.test", password: "a-long-password" }),
      deps(api),
    );
    expect(res.status).toBe(502);
    expect(setCookies(res)).toHaveLength(0);
  });
});

describe("MFA", () => {
  it("needs the challenge cookie: without it, no upstream call is made", async () => {
    const api = fakeApi(() => json(200, {}));
    const res = await handleMfaVerify(
      post("/api/bff/auth/mfa/verify", { code: "123456" }),
      deps(api),
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("bff.challenge_missing");
    expect(api.calls).toHaveLength(0);
  });

  it("verifies with the challenge token from the cookie, then clears the challenge", async () => {
    const api = fakeApi(() =>
      json(200, {
        accessToken: tokenFor("m"),
        refreshToken: "r-mfa",
        expiresIn: 900,
        mfaRequired: false,
        mfaEnrollmentRequired: false,
      }),
    );
    const res = await handleMfaVerify(
      post(
        "/api/bff/auth/mfa/verify",
        { code: "123456" },
        { headers: { Cookie: "__Host-sh_mfa=mfa-challenge-123456" } },
      ),
      deps(api),
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(api.calls[0]?.body as string)).toEqual({
      mfaToken: "mfa-challenge-123456",
      code: "123456",
    });
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.startsWith("__Host-sh_mfa=;") && c.includes("Max-Age=0"))).toBe(
      true,
    );
    expect(cookies.some((c) => c.startsWith("__Host-sh_rt=r-mfa"))).toBe(true);
  });

  it("keeps the challenge when the code is wrong, so the user can retry", async () => {
    const api = fakeApi(() => json(401, { code: "auth.mfa_invalid" }));
    const res = await handleMfaVerify(
      post(
        "/api/bff/auth/mfa/verify",
        { code: "000000" },
        { headers: { Cookie: "__Host-sh_mfa=mfa-challenge-123456" } },
      ),
      deps(api),
    );
    expect(res.status).toBe(401);
    expect(setCookies(res)).toHaveLength(0);
  });
});

describe("enrolment", () => {
  it("starts with the enrolment token and returns the one-time setup secret", async () => {
    const api = fakeApi(() =>
      json(200, { secret: "JBSWY3DPEHPK3PXP", otpAuthUri: "otpauth://totp/x" }),
    );
    const res = await handleEnrollmentStart(
      post(
        "/api/bff/auth/mfa/enrollment",
        {},
        { headers: { Cookie: "__Host-sh_enr=enr-token-abcdef" } },
      ),
      deps(api),
    );
    expect(await res.json()).toMatchObject({ status: "setup", secret: "JBSWY3DPEHPK3PXP" });
    expect(JSON.parse(api.calls[0]?.body as string)).toEqual({
      enrollmentToken: "enr-token-abcdef",
    });
  });

  it("confirms, signs in, returns recovery codes once, and clears the enrolment cookie", async () => {
    const api = fakeApi(() =>
      json(200, {
        accessToken: tokenFor("e"),
        refreshToken: "r-enr",
        expiresIn: 900,
        tokenType: "Bearer",
        recoveryCodes: ["AAAA-1111", "BBBB-2222"],
      }),
    );
    const res = await handleEnrollmentConfirm(
      post(
        "/api/bff/auth/mfa/enrollment/confirm",
        { code: "654321" },
        { headers: { Cookie: "__Host-sh_enr=enr-token-abcdef" } },
      ),
      deps(api),
    );
    expect(await res.json()).toMatchObject({
      status: "signed_in",
      recoveryCodes: ["AAAA-1111", "BBBB-2222"],
    });
    expect(
      setCookies(res).some((c) => c.startsWith("__Host-sh_enr=;") && c.includes("Max-Age=0")),
    ).toBe(true);
  });

  it("refuses to start enrolment without the enrolment cookie", async () => {
    const res = await handleEnrollmentStart(
      post("/api/bff/auth/mfa/enrollment", {}),
      deps(fakeApi(() => json(200, {}))),
    );
    expect(res.status).toBe(401);
  });
});

describe("account and recovery flows", () => {
  it("answers forgot-password with the same 202 whatever the API says (no enumeration)", async () => {
    for (const status of [202, 404, 400]) {
      const api = fakeApi(() => json(status, {}));
      const res = await handleForgotPassword(
        post("/api/bff/auth/password/forgot", { identifier: "nobody@example.test" }),
        deps(api),
      );
      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ status: "sent" });
    }
  });

  it("passes a rate limit through so the form can count down", async () => {
    const api = fakeApi(() => json(429, { code: "rate.limited" }, { "retry-after": "12" }));
    const res = await handleForgotPassword(
      post("/api/bff/auth/password/forgot", { identifier: "nobody@example.test" }),
      deps(api),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
  });

  it("clears every session cookie after a password change, because the backend ends all sessions", async () => {
    const api = fakeApi(() => new Response(null, { status: 204 }));
    const res = await handleChangePassword(
      post(
        "/api/bff/auth/password/change",
        { currentPassword: "old-password-1", newPassword: "new-password-22" },
        { headers: { Cookie: "__Host-sh_at=" + tokenFor("p") } },
      ),
      deps(api),
    );
    expect(res.status).toBe(200);
    expect(api.calls[0]?.accessToken).toBeDefined();
    expect(setCookies(res).filter((c) => c.includes("Max-Age=0"))).toHaveLength(4);
  });

  it("logout revokes the refresh family upstream and clears all four cookies", async () => {
    const api = fakeApi(() => new Response(null, { status: 204 }));
    const res = await handleLogout(
      post("/api/bff/auth/logout", {}, { headers: { Cookie: "__Host-sh_rt=r-live" } }),
      deps(api),
    );
    expect(res.status).toBe(204);
    expect(JSON.parse(api.calls[0]?.body as string)).toEqual({ refreshToken: "r-live" });
    expect(setCookies(res).filter((c) => c.includes("Max-Age=0"))).toHaveLength(4);
  });

  it("logout still clears cookies when the API is unreachable", async () => {
    const api = fakeApi(() => {
      throw new TypeError("fetch failed");
    });
    const res = await handleLogout(
      post("/api/bff/auth/logout", {}, { headers: { Cookie: "__Host-sh_rt=r-live" } }),
      deps(api),
    );
    expect(res.status).toBe(204);
    expect(setCookies(res)).toHaveLength(4);
  });
});

describe("logout when the API cannot revoke", () => {
  it("still clears the cookies, and records that the server-side revoke did not happen", async () => {
    const logs: Array<[string, Record<string, unknown>]> = [];
    const api = fakeApi(() => json(415, { code: "request.unsupported_media_type" }));
    const d = {
      ...deps(api),
      logger: (level: string, fields: Record<string, unknown>) => void logs.push([level, fields]),
    };
    const res = await handleLogout(
      post("/api/bff/auth/logout", {}, { headers: { Cookie: "__Host-sh_rt=r-live" } }),
      d,
    );
    expect(res.status).toBe(204);
    expect(setCookies(res).filter((c) => c.includes("Max-Age=0"))).toHaveLength(4);
    expect(logs.some(([lvl, f]) => lvl === "warn" && f.event === "bff.logout_not_revoked")).toBe(
      true,
    );
  });

  it("counts an unreachable API as a failed revoke too, with no status to report", async () => {
    const logs: Array<[string, Record<string, unknown>]> = [];
    const api = fakeApi(() => {
      throw new TypeError("fetch failed");
    });
    const d = {
      ...deps(api),
      logger: (level: string, fields: Record<string, unknown>) => void logs.push([level, fields]),
    };
    const res = await handleLogout(
      post("/api/bff/auth/logout", {}, { headers: { Cookie: "__Host-sh_rt=r-live" } }),
      d,
    );
    expect(res.status).toBe(204);
    const event = logs.find(([, f]) => f.event === "bff.logout_not_revoked");
    expect(event?.[1]).toEqual({ event: "bff.logout_not_revoked", status: null });
  });

  it("logs the event with a status only, never the refresh token", async () => {
    const logs: Array<[string, Record<string, unknown>]> = [];
    const api = fakeApi(() => json(500, { code: "server.error" }));
    const d = {
      ...deps(api),
      logger: (level: string, fields: Record<string, unknown>) => void logs.push([level, fields]),
    };
    await handleLogout(
      post("/api/bff/auth/logout", {}, { headers: { Cookie: "__Host-sh_rt=r-live-secret-value" } }),
      d,
    );
    expect(JSON.stringify(logs)).not.toContain("r-live-secret-value");
    expect(logs.find(([, f]) => f.event === "bff.logout_not_revoked")?.[1]).toEqual({
      event: "bff.logout_not_revoked",
      status: 500,
    });
  });
});
