// Platform staff sign-in (security review, ADR 0027, findings F3 and F6). A password step only ever yields an MFA challenge or an
// enrolment challenge. Platform access and refresh tokens are set as cookies only after MFA has succeeded. Any answer that does not
// fit that shape fails closed: no cookie is set. Failures are uniform, so the screen never reveals whether an account exists.
import type { ApiClient } from "./api-client";
import {
  clearPlatformCookieHeaders,
  platformEnrollmentCookieHeader,
  platformMfaCookieHeader,
  platformSessionCookieHeaders,
} from "./platform-session";
import { parseCookieHeader } from "./session";
import { platformCookieNames } from "./platform-session";

export type PlatformAuthStep =
  | { step: "mfa"; setCookies: string[] }
  | { step: "enrol"; setCookies: string[] }
  | { step: "signedIn"; setCookies: string[] }
  | { step: "rateLimited"; retryAfterSeconds: number; setCookies: [] }
  | { step: "failed"; setCookies: string[] };

interface LoginBody {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  mfaRequired?: boolean;
  mfaToken?: string | null;
  mfaEnrollmentRequired?: boolean;
  enrollmentToken?: string | null;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

function body(value: unknown): LoginBody {
  return value !== null && typeof value === "object" ? (value as LoginBody) : {};
}

/** The password step. Returns the next step, and the cookies to set for it. */
export async function platformLogin(
  api: ApiClient,
  input: { identifier: string; password: string; clientIp: string | null },
  secure: boolean,
): Promise<PlatformAuthStep> {
  const response = await api.call({
    method: "POST",
    path: "api/v1/platform/auth/login",
    inbound: new Headers({ "content-type": "application/json", accept: "application/json" }),
    body: JSON.stringify({ identifier: input.identifier, password: input.password }),
    tenantSlug: null,
    clientIp: input.clientIp,
    timeoutMs: 10_000,
  });
  if (response.status === 429) {
    await response.body?.cancel();
    return {
      step: "rateLimited",
      retryAfterSeconds: Number(response.headers.get("retry-after") ?? 60),
      setCookies: [],
    };
  }
  const answer = body(await readJson(response));
  if (!response.ok) return { step: "failed", setCookies: [] };
  // F3: a platform sign-in always needs MFA. Anything else fails closed, with no cookie.
  if (answer.mfaEnrollmentRequired && answer.enrollmentToken) {
    return {
      step: "enrol",
      setCookies: [platformEnrollmentCookieHeader(answer.enrollmentToken, { secure })],
    };
  }
  if (answer.mfaRequired && answer.mfaToken) {
    return { step: "mfa", setCookies: [platformMfaCookieHeader(answer.mfaToken, { secure })] };
  }
  return { step: "failed", setCookies: [] };
}

/** The MFA step. Cookies are set only when the code is accepted. */
export async function platformMfaVerify(
  api: ApiClient,
  input: { cookieHeader: string | null; code: string; clientIp: string | null },
  secure: boolean,
): Promise<PlatformAuthStep> {
  const mfaToken = parseCookieHeader(input.cookieHeader)[platformCookieNames(secure).mfa];
  if (!mfaToken) return { step: "failed", setCookies: [] };
  const response = await api.call({
    method: "POST",
    path: "api/v1/platform/auth/mfa/verify",
    inbound: new Headers({ "content-type": "application/json", accept: "application/json" }),
    body: JSON.stringify({ mfaToken, code: input.code }),
    tenantSlug: null,
    clientIp: input.clientIp,
    timeoutMs: 10_000,
  });
  const answer = body(await readJson(response));
  if (
    !response.ok ||
    !answer.accessToken ||
    !answer.refreshToken ||
    typeof answer.expiresIn !== "number"
  ) {
    return { step: "failed", setCookies: [] };
  }
  const clear = clearPlatformCookieHeaders({ secure }).filter((c) =>
    c.startsWith(`${platformCookieNames(secure).mfa}=`),
  );
  return {
    step: "signedIn",
    setCookies: [
      ...platformSessionCookieHeaders(
        {
          accessToken: answer.accessToken,
          refreshToken: answer.refreshToken,
          expiresIn: answer.expiresIn,
        },
        { secure },
      ),
      ...clear,
    ],
  };
}

/** The enrolment step, start: the QR's secret and address, for the user's authenticator (B-52). Only the enrolment cookie is read. */
export async function platformEnrolStart(
  api: ApiClient,
  input: { cookieHeader: string | null; clientIp: string | null },
  secure: boolean,
): Promise<{ ok: true; secret: string; otpAuthUri: string } | { ok: false }> {
  const token = parseCookieHeader(input.cookieHeader)[platformCookieNames(secure).enrollment];
  if (!token) return { ok: false };
  const response = await api.call({
    method: "POST",
    path: "api/v1/platform/auth/mfa/enrollment",
    inbound: new Headers({ "content-type": "application/json", accept: "application/json" }),
    body: JSON.stringify({ enrollmentToken: token }),
    tenantSlug: null,
    clientIp: input.clientIp,
    timeoutMs: 10_000,
  });
  const answer = body(await readJson(response)) as { secret?: string; otpAuthUri?: string };
  if (!response.ok || !answer.secret || !answer.otpAuthUri) return { ok: false };
  return { ok: true, secret: answer.secret, otpAuthUri: answer.otpAuthUri };
}

/**
 * The enrolment step, confirm: the first code proves the authenticator. The session is then set, as after a sign-in with MFA, and
 * the one-time recovery codes are returned to the user once. They are not logged.
 */
export async function platformEnrolConfirm(
  api: ApiClient,
  input: { cookieHeader: string | null; code: string; clientIp: string | null },
  secure: boolean,
): Promise<
  | { step: "signedIn"; setCookies: string[]; recoveryCodes: string[] }
  | { step: "failed"; setCookies: [] }
> {
  const token = parseCookieHeader(input.cookieHeader)[platformCookieNames(secure).enrollment];
  if (!token) return { step: "failed", setCookies: [] };
  const response = await api.call({
    method: "POST",
    path: "api/v1/platform/auth/mfa/enrollment/confirm",
    inbound: new Headers({ "content-type": "application/json", accept: "application/json" }),
    body: JSON.stringify({ enrollmentToken: token, code: input.code }),
    tenantSlug: null,
    clientIp: input.clientIp,
    timeoutMs: 10_000,
  });
  const answer = body(await readJson(response)) as {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    recoveryCodes?: string[];
  };
  if (
    !response.ok ||
    !answer.accessToken ||
    !answer.refreshToken ||
    typeof answer.expiresIn !== "number"
  ) {
    return { step: "failed", setCookies: [] };
  }
  const clearEnrolment = clearPlatformCookieHeaders({ secure }).filter((c) =>
    c.startsWith(`${platformCookieNames(secure).enrollment}=`),
  );
  return {
    step: "signedIn",
    setCookies: [
      ...platformSessionCookieHeaders(
        {
          accessToken: answer.accessToken,
          refreshToken: answer.refreshToken,
          expiresIn: answer.expiresIn,
        },
        { secure },
      ),
      ...clearEnrolment,
    ],
    recoveryCodes: Array.isArray(answer.recoveryCodes)
      ? answer.recoveryCodes.filter((c): c is string => typeof c === "string")
      : [],
  };
}
