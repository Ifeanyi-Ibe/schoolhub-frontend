import { describe, expect, it } from "vitest";
import type { ApiClient, UpstreamCall } from "./api-client";
import { platformLogin, platformMfaVerify } from "./platform-auth";

function api(
  answer: { status: number; body?: unknown; headers?: Record<string, string> },
  seen: UpstreamCall[] = [],
): ApiClient {
  return {
    async call(call) {
      seen.push(call);
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: answer.headers ?? {},
      });
    },
  };
}

const credentials = { identifier: "staff", password: "pw", clientIp: null };

describe("the platform password step", () => {
  it("moves to MFA with only the MFA challenge cookie", async () => {
    const out = await platformLogin(
      api({ status: 200, body: { mfaRequired: true, mfaToken: "m1" } }),
      credentials,
      true,
    );
    expect(out.step).toBe("mfa");
    expect(out.setCookies.join(";")).toContain("__Host-sh_p_mfa=m1");
    expect(out.setCookies.join(";")).not.toContain("sh_p_at");
  });

  it("never sets a platform access cookie from the password step alone (F3)", async () => {
    const out = await platformLogin(
      api({
        status: 200,
        body: { accessToken: "leak", refreshToken: "r", expiresIn: 900, mfaRequired: false },
      }),
      credentials,
      true,
    );
    expect(out.step).toBe("failed");
    expect(out.setCookies).toEqual([]);
  });

  it("routes an enrolment to enrolment only", async () => {
    const out = await platformLogin(
      api({
        status: 200,
        body: { mfaRequired: false, mfaEnrollmentRequired: true, enrollmentToken: "e1" },
      }),
      credentials,
      true,
    );
    expect(out.step).toBe("enrol");
    expect(out.setCookies.join(";")).toContain("__Host-sh_p_enr=e1");
  });

  it("answers a refusal uniformly, with no cookie", async () => {
    const out = await platformLogin(
      api({ status: 401, body: { code: "auth.invalid" } }),
      credentials,
      true,
    );
    expect(out).toEqual({ step: "failed", setCookies: [] });
  });

  it("passes a rate limit on with its wait", async () => {
    const out = await platformLogin(
      api({ status: 429, headers: { "retry-after": "30" } }),
      credentials,
      true,
    );
    expect(out).toEqual({ step: "rateLimited", retryAfterSeconds: 30, setCookies: [] });
  });

  it("sends no tenant: the platform is not a school", async () => {
    const seen: UpstreamCall[] = [];
    await platformLogin(
      api({ status: 200, body: { mfaRequired: true, mfaToken: "m" } }, seen),
      credentials,
      true,
    );
    expect(seen[0]?.tenantSlug).toBeNull();
    expect(seen[0]?.path).toBe("api/v1/platform/auth/login");
  });
});

describe("the platform MFA step", () => {
  it("sets the platform session only when the code is accepted", async () => {
    const out = await platformMfaVerify(
      api({
        status: 200,
        body: { accessToken: "a", refreshToken: "r", expiresIn: 900, mfaRequired: false },
      }),
      { cookieHeader: "__Host-sh_p_mfa=m1", code: "123456", clientIp: null },
      true,
    );
    expect(out.step).toBe("signedIn");
    expect(out.setCookies.join(";")).toContain("__Host-sh_p_at=a");
    expect(out.setCookies.join(";")).toContain("__Host-sh_p_rt=r");
  });

  it("sets nothing when the code is refused", async () => {
    const out = await platformMfaVerify(
      api({ status: 401, body: { code: "auth.mfa_invalid" } }),
      { cookieHeader: "__Host-sh_p_mfa=m1", code: "000000", clientIp: null },
      true,
    );
    expect(out).toEqual({ step: "failed", setCookies: [] });
  });

  it("refuses without an MFA challenge cookie, and does not call the API", async () => {
    const seen: UpstreamCall[] = [];
    const out = await platformMfaVerify(
      api({ status: 200, body: {} }, seen),
      { cookieHeader: "__Host-sh_at=school", code: "123456", clientIp: null },
      true,
    );
    expect(out.step).toBe("failed");
    expect(seen).toHaveLength(0);
  });

  it("does not accept a school's MFA cookie", async () => {
    const out = await platformMfaVerify(
      api({ status: 200, body: {} }),
      { cookieHeader: "__Host-sh_mfa=school", code: "123456", clientIp: null },
      true,
    );
    expect(out.step).toBe("failed");
  });
});
