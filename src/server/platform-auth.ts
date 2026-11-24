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
