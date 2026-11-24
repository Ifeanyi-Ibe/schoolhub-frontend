import { describe, expect, it } from "vitest";
import {
  clearPlatformCookieHeaders,
  platformCookieNames,
  platformSessionCookieHeaders,
} from "./platform-session";
import { cookieNames } from "./session";

describe("platform cookies are separate from the school's", () => {
  it("never share a name with a school cookie, in either mode", () => {
    for (const secure of [true, false]) {
      const school = Object.values(cookieNames(secure));
      const platform = Object.values(platformCookieNames(secure));
      for (const name of platform) expect(school).not.toContain(name);
    }
  });

  it("use the __Host- prefix over HTTPS, and the plain names locally", () => {
    expect(platformCookieNames(true).access).toBe("__Host-sh_p_at");
    expect(platformCookieNames(false).access).toBe("sh_p_at");
  });

  it("are httpOnly, SameSite=Lax, and Secure over HTTPS", () => {
    const [access] = platformSessionCookieHeaders(
      { accessToken: "a", refreshToken: "r", expiresIn: 900 },
      { secure: true },
    );
    expect(access).toContain("HttpOnly");
    expect(access).toContain("SameSite=Lax");
    expect(access).toContain("Secure");
    expect(access).toContain("Max-Age=900");
  });

  it("clearing removes only platform cookies", () => {
    const cleared = clearPlatformCookieHeaders({ secure: true }).join(";");
    expect(cleared).toContain("__Host-sh_p_at=");
    expect(cleared).not.toContain("__Host-sh_at=");
  });
});
