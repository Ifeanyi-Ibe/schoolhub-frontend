import { describe, expect, it } from "vitest";
import {
  cookieNames,
  accessTokenNeedsRefresh,
  clearSessionCookieHeaders,
  enrollmentChallengeCookieHeader,
  jwtExpiryMs,
  mfaChallengeCookieHeader,
  parseCookieHeader,
  serializeCookie,
  sessionCookieHeaders,
} from "./session";

function jwtWithExp(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("session cookies", () => {
  it("sets httpOnly, SameSite=Lax, Path=/, and no Domain (host-only, so tenants stay isolated)", () => {
    const [access, refresh] = sessionCookieHeaders(
      { accessToken: "a.b.c", refreshToken: "r1", expiresIn: 900 },
      { secure: true },
    );
    for (const c of [access, refresh]) {
      expect(c).toContain("HttpOnly");
      expect(c).toContain("SameSite=Lax");
      expect(c).toContain("Path=/");
      expect(c).toContain("Secure");
      expect(c).not.toMatch(/Domain=/i);
    }
    expect(access).toBe(
      `${cookieNames(true).access}=a.b.c; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=900`,
    );
    expect(refresh).toMatch(new RegExp(`^${cookieNames(true).refresh}=r1; .*Max-Age=2592000$`));
  });

  it("omits Secure on plain http (local development)", () => {
    expect(serializeCookie("x", "1", { secure: false })).not.toContain("Secure");
  });

  it("clears both cookies with Max-Age=0", () => {
    const cleared = clearSessionCookieHeaders({ secure: true });
    expect(cleared).toHaveLength(4);
    for (const c of cleared) {
      expect(c).toMatch(/=; Path=\/;/);
      expect(c).toContain("Max-Age=0");
    }
  });

  it("parses a Cookie header", () => {
    expect(parseCookieHeader("sh_at=abc; sh_rt=def ;theme=dark")).toEqual({
      sh_at: "abc",
      sh_rt: "def",
      theme: "dark",
    });
    expect(parseCookieHeader(null)).toEqual({});
  });
});

describe("access token timing", () => {
  it("reads exp from the payload without verifying the signature", () => {
    expect(jwtExpiryMs(jwtWithExp(1_900_000_000))).toBe(1_900_000_000_000);
    expect(jwtExpiryMs("not-a-jwt")).toBeNull();
  });

  it("asks for a refresh within the skew window, or when the token is missing or unreadable", () => {
    const now = 1_900_000_000_000;
    expect(accessTokenNeedsRefresh(undefined, now)).toBe(true);
    expect(accessTokenNeedsRefresh("garbage", now)).toBe(true);
    expect(accessTokenNeedsRefresh(jwtWithExp(now / 1000 + 600), now)).toBe(false);
    expect(accessTokenNeedsRefresh(jwtWithExp(now / 1000 + 30), now)).toBe(true);
  });
});

describe("challenge cookies (sh_mfa, sh_enr)", () => {
  it("live five minutes, httpOnly, SameSite=Lax, and carry the __Host- prefix over https", () => {
    const mfa = mfaChallengeCookieHeader("mfa-token-value-1234", { secure: true });
    const enr = enrollmentChallengeCookieHeader("enr-token-value-1234", { secure: true });
    for (const c of [mfa, enr]) {
      expect(c).toContain("Max-Age=300");
      expect(c).toContain("HttpOnly");
      expect(c).toContain("SameSite=Lax");
      expect(c).toContain("Secure");
      expect(c).toContain("Path=/");
      expect(c).not.toContain("Domain=");
    }
    expect(mfa.startsWith("__Host-sh_mfa=")).toBe(true);
    expect(enr.startsWith("__Host-sh_enr=")).toBe(true);
  });

  it("uses the plain names over http, with the same lifetime", () => {
    expect(mfaChallengeCookieHeader("t", { secure: false })).toMatch(/^sh_mfa=t;.*Max-Age=300/);
    expect(enrollmentChallengeCookieHeader("t", { secure: false })).toMatch(
      /^sh_enr=t;.*Max-Age=300/,
    );
  });
});
