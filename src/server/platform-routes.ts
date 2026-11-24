// The platform BFF routes (security review, ADR 0027): the platform sign-in steps and the proxy for the platform API. Platform
// calls carry only the platform access cookie; they never carry a school token (finding F1). Writes pass the same CSRF and origin
// guard as the school's (finding F4). Failures are uniform (finding F6).
import { problemResponse } from "./problem";
import { checkMutationRequest } from "./request-guards";
import {
  platformEnrolConfirm,
  platformEnrolStart,
  platformLogin,
  platformMfaVerify,
  type PlatformAuthStep,
} from "./platform-auth";
import { clearPlatformCookieHeaders, platformCookieNames } from "./platform-session";
import { parseCookieHeader } from "./session";
import { clientIpFromForwardedFor } from "./client-ip";
import { isSecureOrigin, relay, type BffDeps } from "./bff-proxy";
import type { UpstreamCall } from "./api-client";

const SAFE_SEGMENT = /^[A-Za-z0-9._~-]+$/;
const MAX_CREDENTIAL = 256;
const UNIFORM_LOGIN_FAILURE = "The sign-in did not work. Check your details and try again.";

function guard(request: Request, deps: BffDeps): Response | null {
  const result = checkMutationRequest({
    method: request.method,
    headers: request.headers,
    appOrigin: deps.env.APP_ORIGIN,
  });
  if (result.ok) return null;
  return problemResponse(result.status, result.code, "Forbidden", result.detail);
}

function withCookies(
  payload: Record<string, unknown>,
  status: number,
  setCookies: string[],
): Response {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(payload), { status, headers });
}

/** Answers the browser with the step only. No token is ever part of this answer. */
function stepAnswer(step: PlatformAuthStep): Response {
  if (step.step === "rateLimited") {
    return withCookies({ step: "rateLimited", retryAfterSeconds: step.retryAfterSeconds }, 429, []);
  }
  if (step.step === "failed") {
    return withCookies({ step: "failed", message: UNIFORM_LOGIN_FAILURE }, 401, []);
  }
  return withCookies({ step: step.step }, 200, step.setCookies);
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const parsed: unknown = await request.json().catch(() => null);
  return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
}

export async function handlePlatformLogin(request: Request, deps: BffDeps): Promise<Response> {
  const refused = guard(request, deps);
  if (refused) return refused;
  const body = await readBody(request);
  const identifier = body?.identifier;
  const password = body?.password;
  if (
    typeof identifier !== "string" ||
    typeof password !== "string" ||
    identifier === "" ||
    password === "" ||
    identifier.length > MAX_CREDENTIAL ||
    password.length > MAX_CREDENTIAL
  )
    return withCookies({ step: "failed", message: UNIFORM_LOGIN_FAILURE }, 400, []);
  const secure = isSecureOrigin(deps.env.APP_ORIGIN);
  const clientIp = clientIpFromForwardedFor(
    request.headers.get("x-forwarded-for"),
    deps.env.TRUSTED_PROXY_COUNT,
  );
  return stepAnswer(await platformLogin(deps.api, { identifier, password, clientIp }, secure));
}

export async function handlePlatformMfa(request: Request, deps: BffDeps): Promise<Response> {
  const refused = guard(request, deps);
  if (refused) return refused;
  const body = await readBody(request);
  const code = body?.code;
  if (typeof code !== "string" || !/^\d{6}$/.test(code))
    return withCookies({ step: "failed", message: UNIFORM_LOGIN_FAILURE }, 400, []);
  const secure = isSecureOrigin(deps.env.APP_ORIGIN);
  const clientIp = clientIpFromForwardedFor(
    request.headers.get("x-forwarded-for"),
    deps.env.TRUSTED_PROXY_COUNT,
  );
  return stepAnswer(
    await platformMfaVerify(
      deps.api,
      { cookieHeader: request.headers.get("cookie"), code, clientIp },
      secure,
    ),
  );
}

export function handlePlatformLogout(request: Request, deps: BffDeps): Response {
  const refused = guard(request, deps);
  if (refused) return refused;
  const secure = isSecureOrigin(deps.env.APP_ORIGIN);
  const headers = new Headers({ "cache-control": "no-store" });
  for (const c of clearPlatformCookieHeaders({ secure })) headers.append("Set-Cookie", c);
  return new Response(null, { status: 204, headers });
}

/** The platform API path: `api/v1/platform/...`, each segment a plain token. Anything else is refused. */
export function validatePlatformSegments(segments: readonly string[]): string | null {
  if (segments.length < 3) return null;
  if (segments[0] !== "api" || segments[1] !== "v1" || segments[2] !== "platform") return null;
  for (const s of segments) if (!SAFE_SEGMENT.test(s) || s === "." || s === "..") return null;
  return segments.join("/");
}

export async function handlePlatformProxy(
  request: Request,
  segments: string[],
  deps: BffDeps,
): Promise<Response> {
  const path = validatePlatformSegments(segments);
  if (path === null)
    return problemResponse(404, "platform.not_found", "Not found", "No such platform route.");
  if (request.method !== "GET") {
    const refused = guard(request, deps);
    if (refused) return refused;
  }
  const secure = isSecureOrigin(deps.env.APP_ORIGIN);
  const accessToken = parseCookieHeader(request.headers.get("cookie"))[
    platformCookieNames(secure).access
  ];
  if (!accessToken)
    return problemResponse(401, "platform.session_required", "Sign in", "Sign in to the platform.");
  // The idempotency key is the one header a platform write needs besides its body (the contract declares it on the top-up).
  const inbound = new Headers({
    accept: request.headers.get("accept") ?? "application/json",
    "content-type": request.headers.get("content-type") ?? "",
  });
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) inbound.set("idempotency-key", idempotencyKey);
  const call: UpstreamCall = {
    method: request.method,
    path,
    search: new URL(request.url).search,
    inbound,
    body: request.method === "GET" ? null : await request.text(),
    accessToken,
    tenantSlug: null,
    clientIp: clientIpFromForwardedFor(
      request.headers.get("x-forwarded-for"),
      deps.env.TRUSTED_PROXY_COUNT,
    ),
    timeoutMs: 15_000,
  };
  const upstream = await deps.api.call(call);
  if (upstream.status === 401) {
    // The platform session has ended: clear the platform cookies, so the next request signs in again.
    await upstream.body?.cancel();
    const headers = new Headers({
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    for (const c of clearPlatformCookieHeaders({ secure })) headers.append("Set-Cookie", c);
    return new Response(
      JSON.stringify({ code: "platform.session_ended", title: "Sign in again" }),
      { status: 401, headers },
    );
  }
  return relay(upstream);
}

/** Enrolment, start: returns the secret and address for the user's authenticator. Needs the enrolment cookie. */
export async function handlePlatformEnrolStart(request: Request, deps: BffDeps): Promise<Response> {
  const refused = guard(request, deps);
  if (refused) return refused;
  const secure = isSecureOrigin(deps.env.APP_ORIGIN);
  const clientIp = clientIpFromForwardedFor(
    request.headers.get("x-forwarded-for"),
    deps.env.TRUSTED_PROXY_COUNT,
  );
  const started = await platformEnrolStart(
    deps.api,
    { cookieHeader: request.headers.get("cookie"), clientIp },
    secure,
  );
  if (!started.ok) return withCookies({ step: "failed", message: UNIFORM_LOGIN_FAILURE }, 401, []);
  return withCookies(
    { step: "enrolment", secret: started.secret, otpAuthUri: started.otpAuthUri },
    200,
    [],
  );
}

/** Enrolment, confirm: the first code sets the session and returns the recovery codes, once. */
export async function handlePlatformEnrolConfirm(
  request: Request,
  deps: BffDeps,
): Promise<Response> {
  const refused = guard(request, deps);
  if (refused) return refused;
  const body = await readBody(request);
  const code = body?.code;
  if (typeof code !== "string" || !/^\d{6}$/.test(code))
    return withCookies({ step: "failed", message: UNIFORM_LOGIN_FAILURE }, 400, []);
  const secure = isSecureOrigin(deps.env.APP_ORIGIN);
  const clientIp = clientIpFromForwardedFor(
    request.headers.get("x-forwarded-for"),
    deps.env.TRUSTED_PROXY_COUNT,
  );
  const done = await platformEnrolConfirm(
    deps.api,
    { cookieHeader: request.headers.get("cookie"), code, clientIp },
    secure,
  );
  if (done.step !== "signedIn")
    return withCookies({ step: "failed", message: UNIFORM_LOGIN_FAILURE }, 401, []);
  // The recovery codes are returned once, to the user who just enrolled. They are not logged, and not stored.
  return withCookies({ step: "signedIn", recoveryCodes: done.recoveryCodes }, 200, done.setCookies);
}
