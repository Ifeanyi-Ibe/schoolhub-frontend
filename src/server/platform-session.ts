// Platform staff sessions (security review, ADR 0027). A separate set of cookies from the school's: the names carry `sh_p_`, so no
// school cookie can be read as a platform one, and platform routes never read a school cookie (finding F2). Attributes match the
// school's: httpOnly, SameSite=Lax, and Secure with the __Host- prefix over HTTPS.
import { serializeCookie } from "./session";

const REFRESH_MAX_AGE_S = 30 * 24 * 60 * 60;
const CHALLENGE_MAX_AGE_S = 5 * 60;

export interface PlatformCookieNames {
  access: string;
  refresh: string;
  mfa: string;
  enrollment: string;
}

export function platformCookieNames(secure: boolean): PlatformCookieNames {
  const p = secure ? "__Host-" : "";
  return {
    access: `${p}sh_p_at`,
    refresh: `${p}sh_p_rt`,
    mfa: `${p}sh_p_mfa`,
    enrollment: `${p}sh_p_enr`,
  };
}

/** The platform session's cookies, after MFA has succeeded (finding F3: never before). */
export function platformSessionCookieHeaders(
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  opts: { secure: boolean },
): string[] {
  const n = platformCookieNames(opts.secure);
  return [
    serializeCookie(n.access, tokens.accessToken, {
      secure: opts.secure,
      maxAgeSeconds: tokens.expiresIn,
    }),
    serializeCookie(n.refresh, tokens.refreshToken, {
      secure: opts.secure,
      maxAgeSeconds: REFRESH_MAX_AGE_S,
    }),
  ];
}

export function platformMfaCookieHeader(mfaToken: string, opts: { secure: boolean }): string {
  return serializeCookie(platformCookieNames(opts.secure).mfa, mfaToken, {
    secure: opts.secure,
    maxAgeSeconds: CHALLENGE_MAX_AGE_S,
  });
}

export function platformEnrollmentCookieHeader(token: string, opts: { secure: boolean }): string {
  return serializeCookie(platformCookieNames(opts.secure).enrollment, token, {
    secure: opts.secure,
    maxAgeSeconds: CHALLENGE_MAX_AGE_S,
  });
}

/** Clears every platform cookie. The school's cookies are not touched. */
export function clearPlatformCookieHeaders(opts: { secure: boolean }): string[] {
  const n = platformCookieNames(opts.secure);
  return [n.access, n.refresh, n.mfa, n.enrollment].map((name) =>
    serializeCookie(name, "", { secure: opts.secure, maxAgeSeconds: 0 }),
  );
}
