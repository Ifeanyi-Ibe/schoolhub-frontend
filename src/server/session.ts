// Session cookies. Tokens live only in httpOnly cookies that the browser sends to our own host.
// Cookies have no Domain attribute, so each school's cookies stay on that school's host
// (tenant isolation): a cookie set on school A is never sent to school B.

export const ACCESS_COOKIE = "sh_at";
export const REFRESH_COOKIE = "sh_rt";

/** Refresh cookie lifetime: the backend's 30-day sliding window (backend CLAUDE.md §8.2). */
const REFRESH_MAX_AGE_S = 30 * 24 * 60 * 60;

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
  return [
    serializeCookie(ACCESS_COOKIE, tokens.accessToken, {
      secure: opts.secure,
      maxAgeSeconds: tokens.expiresIn,
    }),
    serializeCookie(REFRESH_COOKIE, tokens.refreshToken, {
      secure: opts.secure,
      maxAgeSeconds: REFRESH_MAX_AGE_S,
    }),
  ];
}

export function clearSessionCookieHeaders(opts: { secure: boolean }): string[] {
  return [
    serializeCookie(ACCESS_COOKIE, "", { secure: opts.secure, maxAgeSeconds: 0 }),
    serializeCookie(REFRESH_COOKIE, "", { secure: opts.secure, maxAgeSeconds: 0 }),
  ];
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
