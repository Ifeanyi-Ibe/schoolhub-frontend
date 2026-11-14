// BFF auth flows. Tokens never leave the server: they go into httpOnly cookies, and the browser
// receives only a status (plus the one-time authenticator setup secret, which the user must see).
import type { BffDeps } from "./bff-proxy";
import { relay, isSecureOrigin, tenantFor } from "./bff-proxy";
import { clientIpFromForwardedFor } from "./client-ip";
import { checkMutationRequest } from "./request-guards";
import { log } from "./log";
import { problemResponse } from "./problem";
import {
  clearSessionCookieHeaders,
  cookieNames,
  enrollmentChallengeCookieHeader,
  mfaChallengeCookieHeader,
  parseCookieHeader,
  sessionCookieHeaders,
  type SessionTokens,
} from "./session";
import type { UpstreamCall } from "./api-client";
import { z } from "zod";
import * as S from "./auth-schemas";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

const loginResponse = z.object({
  accessToken: z.string().nullish(),
  refreshToken: z.string().nullish(),
  expiresIn: z.coerce.number().int().positive().nullish(),
  mfaRequired: z.boolean().nullish(),
  mfaToken: z.string().nullish(),
  mfaEnrollmentRequired: z.boolean().nullish(),
  enrollmentToken: z.string().nullish(),
});
const enrollmentDone = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.coerce.number().int().positive(),
  recoveryCodes: z.array(z.string()),
});
const enrollmentStart = z.object({ secret: z.string(), otpAuthUri: z.string() });

type Gate = { ok: true; secure: boolean } | { ok: false; response: Response };

function gate(request: Request, deps: BffDeps): Gate {
  const guard = checkMutationRequest({
    method: request.method,
    headers: request.headers,
    appOrigin: deps.env.APP_ORIGIN,
  });
  if (!guard.ok)
    return {
      ok: false,
      response: problemResponse(guard.status, guard.code, "Forbidden", guard.detail),
    };
  return { ok: true, secure: isSecureOrigin(deps.env.APP_ORIGIN) };
}

async function readBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T> | Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return problemResponse(400, "bff.body_invalid", "Invalid request", "Send a JSON body.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      (errors[field] ??= []).push(issue.message);
    }
    return json(400, {
      type: "about:blank",
      title: "Please check the form.",
      status: 400,
      code: "bff.validation_failed",
      errors,
    });
  }
  return parsed.data;
}

function callUpstream(
  deps: BffDeps,
  request: Request,
  method: string,
  path: string,
  body: unknown,
  accessToken?: string,
) {
  const tenantSlug = tenantFor(deps, request);
  const clientIp = clientIpFromForwardedFor(
    request.headers.get("x-forwarded-for"),
    deps.env.TRUSTED_PROXY_COUNT,
  );
  const call: UpstreamCall = {
    method,
    path,
    inbound: request.headers,
    body: body === undefined ? null : JSON.stringify(body),
    accessToken,
    tenantSlug,
    clientIp,
    timeoutMs: 15_000,
    signal: request.signal,
  };
  return deps.api.call(call).catch(() => null);
}

function upstreamDown(): Response {
  return problemResponse(
    502,
    "bff.upstream_unavailable",
    "Bad gateway",
    "The school system is unreachable.",
  );
}

function sessionTokens(t: {
  accessToken?: string | null | undefined;
  refreshToken?: string | null | undefined;
  expiresIn?: number | null | undefined;
}): SessionTokens | null {
  if (!t.accessToken || !t.refreshToken || !t.expiresIn) return null;
  return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn };
}

/** Set session cookies, clear every challenge cookie, and answer with a status only. */
function signedIn(
  tokens: SessionTokens,
  secure: boolean,
  extra: Record<string, unknown> = {},
): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const c of clearChallengeCookies(secure)) headers.append("Set-Cookie", c);
  for (const c of sessionCookieHeaders(tokens, { secure })) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify({ status: "signed_in", ...extra }), { status: 200, headers });
}

function clearChallengeCookies(secure: boolean): string[] {
  const n = cookieNames(secure);
  return [n.mfa, n.enrollment].map(
    (name) => `${name}=; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}; Max-Age=0`,
  );
}

function clearAllCookies(response: Response, secure: boolean): Response {
  for (const c of clearSessionCookieHeaders({ secure })) response.headers.append("Set-Cookie", c);
  return response;
}

/** Map a login-style upstream response to the browser-facing status. */
async function interpretLogin(upstream: Response, secure: boolean): Promise<Response> {
  if (!upstream.ok) return relay(upstream);
  const parsed = loginResponse.safeParse(await upstream.json().catch(() => undefined));
  if (!parsed.success)
    return problemResponse(
      502,
      "bff.unexpected_response",
      "Bad gateway",
      "Unexpected response from the school system.",
    );
  const body = parsed.data;
  if (body.mfaEnrollmentRequired && body.enrollmentToken) {
    const res = json(200, { status: "enrollment_required" });
    res.headers.append(
      "Set-Cookie",
      enrollmentChallengeCookieHeader(body.enrollmentToken, { secure }),
    );
    return res;
  }
  if (body.mfaRequired && body.mfaToken) {
    const res = json(200, { status: "mfa_required" });
    res.headers.append("Set-Cookie", mfaChallengeCookieHeader(body.mfaToken, { secure }));
    return res;
  }
  const tokens = sessionTokens(body);
  if (!tokens)
    return problemResponse(
      502,
      "bff.unexpected_response",
      "Bad gateway",
      "Unexpected response from the school system.",
    );
  return signedIn(tokens, secure);
}

export async function handleLogin(request: Request, deps: BffDeps): Promise<Response> {
  const g = gate(request, deps);
  if (!g.ok) return g.response;
  const body = await readBody(request, S.loginInput);
  if (body instanceof Response) return body;
  const upstreamBody: S.UpstreamLoginRequest = {
    identifier: body.identifier,
    password: body.password,
  };
  const upstream = await callUpstream(deps, request, "POST", "api/v1/auth/login", upstreamBody);
  return upstream ? interpretLogin(upstream, g.secure) : upstreamDown();
}

export async function handleOtpRequest(request: Request, deps: BffDeps): Promise<Response> {
  const g = gate(request, deps);
  if (!g.ok) return g.response;
  const body = await readBody(request, S.otpRequestInput);
  if (body instanceof Response) return body;
  const upstream = await callUpstream(deps, request, "POST", "api/v1/auth/otp/request", {
    phone: body.phone,
  });
  if (!upstream) return upstreamDown();
  if (upstream.status === 429 || upstream.status >= 500) return relay(upstream);
  await upstream.body?.cancel();
  return json(202, { status: "sent" }); // uniform: the API answers 202 whether or not the number exists
}

export async function handleOtpVerify(request: Request, deps: BffDeps): Promise<Response> {
  const g = gate(request, deps);
  if (!g.ok) return g.response;
  const body = await readBody(request, S.otpVerifyInput);
  if (body instanceof Response) return body;
  const upstreamBody: S.UpstreamOtpVerifyBody = { phone: body.phone, code: body.code };
  const upstream = await callUpstream(
    deps,
    request,
    "POST",
    "api/v1/auth/otp/verify",
    upstreamBody,
  );
  return upstream ? interpretLogin(upstream, g.secure) : upstreamDown();
}

export async function handleMfaVerify(request: Request, deps: BffDeps): Promise<Response> {
  const g = gate(request, deps);
  if (!g.ok) return g.response;
  const mfaToken = parseCookieHeader(request.headers.get("cookie"))[cookieNames(g.secure).mfa];
  if (!mfaToken)
    return problemResponse(
      401,
      "bff.challenge_missing",
      "Sign in again",
      "Your sign-in step has expired. Please sign in again.",
    );
  const body = await readBody(request, S.mfaCodeInput);
  if (body instanceof Response) return body;
  const upstreamBody: S.UpstreamMfaCodeRequest = { mfaToken, code: body.code };
  const upstream = await callUpstream(
    deps,
    request,
    "POST",
    "api/v1/auth/mfa/verify",
    upstreamBody,
  );
  if (!upstream) return upstreamDown();
  if (!upstream.ok) return relay(upstream); // the challenge cookie stays, so the user can retry
  return interpretLogin(upstream, g.secure);
}

export async function handleEnrollmentStart(request: Request, deps: BffDeps): Promise<Response> {
  const g = gate(request, deps);
  if (!g.ok) return g.response;
  const token = parseCookieHeader(request.headers.get("cookie"))[cookieNames(g.secure).enrollment];
  if (!token)
    return problemResponse(
      401,
      "bff.challenge_missing",
      "Sign in again",
      "Your sign-in step has expired. Please sign in again.",
    );
  const upstream = await callUpstream(deps, request, "POST", "api/v1/auth/mfa/enrollment", {
    enrollmentToken: token,
  });
  if (!upstream) return upstreamDown();
  if (!upstream.ok) return relay(upstream);
  const parsed = enrollmentStart.safeParse(await upstream.json().catch(() => undefined));
  if (!parsed.success)
    return problemResponse(
      502,
      "bff.unexpected_response",
      "Bad gateway",
      "Unexpected response from the school system.",
    );
  // The secret is shown to the user once, to set up their app. It is never stored by the BFF.
  return json(200, {
    status: "setup",
    secret: parsed.data.secret,
    otpAuthUri: parsed.data.otpAuthUri,
  });
}

export async function handleEnrollmentConfirm(request: Request, deps: BffDeps): Promise<Response> {
  const g = gate(request, deps);
  if (!g.ok) return g.response;
  const token = parseCookieHeader(request.headers.get("cookie"))[cookieNames(g.secure).enrollment];
  if (!token)
    return problemResponse(
      401,
      "bff.challenge_missing",
      "Sign in again",
      "Your sign-in step has expired. Please sign in again.",
    );
  const body = await readBody(request, S.enrollmentConfirmInput);
  if (body instanceof Response) return body;
  const upstreamBody: S.UpstreamEnrollmentConfirmRequest = {
    enrollmentToken: token,
    code: body.code,
  };
  const upstream = await callUpstream(
    deps,
    request,
    "POST",
    "api/v1/auth/mfa/enrollment/confirm",
    upstreamBody,
  );
  if (!upstream) return upstreamDown();
  if (!upstream.ok) return relay(upstream);
  const parsed = enrollmentDone.safeParse(await upstream.json().catch(() => undefined));
  if (!parsed.success)
    return problemResponse(
      502,
      "bff.unexpected_response",
      "Bad gateway",
      "Unexpected response from the school system.",
    );
  const tokens = {
    accessToken: parsed.data.accessToken,
    refreshToken: parsed.data.refreshToken,
    expiresIn: parsed.data.expiresIn,
  };
  // Recovery codes are shown once, here. They are not stored by the BFF.
  return signedIn(tokens, g.secure, { recoveryCodes: parsed.data.recoveryCodes });
}

export async function handleForgotPassword(request: Request, deps: BffDeps): Promise<Response> {
  const g = gate(request, deps);
  if (!g.ok) return g.response;
  const body = await readBody(request, S.forgotInput);
  if (body instanceof Response) return body;
  const upstream = await callUpstream(deps, request, "POST", "api/v1/auth/password/forgot", {
    identifier: body.identifier,
  });
  if (!upstream) return upstreamDown();
  if (upstream.status === 429 || upstream.status >= 500) return relay(upstream);
  await upstream.body?.cancel();
  return json(202, { status: "sent" }); // uniform, whether or not the account exists
}

export async function handlePasswordReset(request: Request, deps: BffDeps): Promise<Response> {
  const g = gate(request, deps);
  if (!g.ok) return g.response;
  const body = await readBody(request, S.resetInput);
  if (body instanceof Response) return body;
  const upstreamBody: S.UpstreamResetPasswordRequest = {
    token: body.token,
    password: body.password,
  };
  const upstream = await callUpstream(
    deps,
    request,
    "POST",
    "api/v1/auth/password/reset",
    upstreamBody,
  );
  if (!upstream) return upstreamDown();
  if (!upstream.ok) return relay(upstream);
  await upstream.body?.cancel();
  return json(200, { status: "reset" });
}

export async function handleInviteAccept(request: Request, deps: BffDeps): Promise<Response> {
  const g = gate(request, deps);
  if (!g.ok) return g.response;
  const body = await readBody(request, S.inviteInput);
  if (body instanceof Response) return body;
  const upstream = await callUpstream(deps, request, "POST", "api/v1/auth/invites/accept", {
    token: body.token,
    password: body.password,
  });
  if (!upstream) return upstreamDown();
  if (!upstream.ok) return relay(upstream);
  await upstream.body?.cancel();
  return json(200, { status: "accepted" });
}

/** Changing the password ends every session (backend §8.2), so the cookies are cleared on success. */
export async function handleChangePassword(request: Request, deps: BffDeps): Promise<Response> {
  const g = gate(request, deps);
  if (!g.ok) return g.response;
  const access = parseCookieHeader(request.headers.get("cookie"))[cookieNames(g.secure).access];
  if (!access)
    return problemResponse(401, "bff.session_ended", "Signed out", "Please sign in again.");
  const body = await readBody(request, S.changePasswordInput);
  if (body instanceof Response) return body;
  const upstreamBody: S.UpstreamChangePasswordRequest = {
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  };
  const upstream = await callUpstream(
    deps,
    request,
    "POST",
    "api/v1/me/password",
    upstreamBody,
    access,
  );
  if (!upstream) return upstreamDown();
  if (!upstream.ok) return relay(upstream);
  await upstream.body?.cancel();
  return clearAllCookies(json(200, { status: "password_changed_signed_out" }), g.secure);
}

/** Sign out: revoke the refresh family on the API (best effort), then clear every cookie. */
export async function handleLogout(request: Request, deps: BffDeps): Promise<Response> {
  const g = gate(request, deps);
  if (!g.ok) return g.response;
  const names = cookieNames(g.secure);
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  if (cookies[names.refresh]) {
    const upstream = await callUpstream(deps, request, "POST", "api/v1/auth/logout", {
      refreshToken: cookies[names.refresh],
    });
    // The cookies are cleared either way; a failed server-side revoke is logged so it is noticed.
    if (!upstream?.ok) {
      (deps.logger ?? log)("warn", {
        event: "bff.logout_not_revoked",
        status: upstream?.status ?? null,
      });
    }
    await upstream?.body?.cancel();
  }
  return clearAllCookies(
    new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }),
    g.secure,
  );
}
