// Session cookies. Tokens live only in httpOnly cookies that the browser sends to our own host.
//
// Names: over HTTPS (Secure) the cookies use the __Host- prefix, which the browser enforces as
// Secure, Path=/, and no Domain. Over plain http (local development) browsers refuse __Host- on
// a non-secure origin, so the plain names are used there. Cookies have no Domain attribute in
// either case, so each school's cookies stay on that school's host (tenant isolation).

/** Refresh cookie lifetime: the backend's 30-day sliding window (backend CLAUDE.md §8.2). */
const REFRESH_MAX_AGE_S = 30 * 24 * 60 * 60;
/** MFA and enrolment challenges are short-lived, matching the backend's token lifetimes. */
const CHALLENGE_MAX_AGE_S = 5 * 60;

export interface CookieNames {
  access: string;
  refresh: string;
  mfa: string;
  enrollment: string;
}

export function cookieNames(secure: boolean): CookieNames {
  const p = secure ? "__Host-" : "";
  return {
    access: `${p}sh_at`,
    refresh: `${p}sh_rt`,
    mfa: `${p}sh_mfa`,
    enrollment: `${p}sh_enr`,
  };
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds, as returned by the API (`expiresIn`). */
  expiresIn: number;
}

export interface CookieOptions {
  secure: boolean;
  maxAgeSeconds?: number;
}

/** Serialize one Set-Cookie header value with the security attributes we require. */
export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (opts.secure) parts.push("Secure");
  if (opts.maxAgeSeconds !== undefined)
    parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAgeSeconds))}`);
  return parts.join("; ");
}

export function sessionCookieHeaders(tokens: SessionTokens, opts: { secure: boolean }): string[] {
  const n = cookieNames(opts.secure);
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

/** Clear every BFF cookie: session, MFA challenge and enrolment challenge. */
export function clearSessionCookieHeaders(opts: { secure: boolean }): string[] {
  const n = cookieNames(opts.secure);
  return [n.access, n.refresh, n.mfa, n.enrollment].map((name) =>
    serializeCookie(name, "", { secure: opts.secure, maxAgeSeconds: 0 }),
  );
}

export function mfaChallengeCookieHeader(mfaToken: string, opts: { secure: boolean }): string {
  return serializeCookie(cookieNames(opts.secure).mfa, mfaToken, {
    secure: opts.secure,
    maxAgeSeconds: CHALLENGE_MAX_AGE_S,
  });
}

export function enrollmentChallengeCookieHeader(token: string, opts: { secure: boolean }): string {
  return serializeCookie(cookieNames(opts.secure).enrollment, token, {
    secure: opts.secure,
    maxAgeSeconds: CHALLENGE_MAX_AGE_S,
  });
}

/** Parse a Cookie request header. Values are not decoded; tokens are opaque ASCII. */
export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 1) continue;
    const name = pair.slice(0, idx).trim();
    if (name) out[name] = pair.slice(idx + 1).trim();
  }
  return out;
}

/**
 * Expiry (epoch ms) of a JWT, read from its payload WITHOUT verifying the signature.
 * Used only to schedule refresh; the API verifies every token it receives.
 */
export function jwtExpiryMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when the access token expires within `skewMs`, or cannot be read. */
export function accessTokenNeedsRefresh(
  token: string | undefined,
  nowMs: number,
  skewMs = 60_000,
): boolean {
  if (!token) return true;
  const exp = jwtExpiryMs(token);
  return exp === null || exp - nowMs <= skewMs;
}
