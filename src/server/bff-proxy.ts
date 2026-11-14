// The BFF request pipeline. Route handlers call these functions with the real environment, the
// real API client and the real clock. Tests call them with fakes.
//
// Order for every proxied request:
//   1. CSRF / Origin guard (mutations only)
//   2. path validation (api/v1 only, plain segments)
//   3. tenant from the Host header; client IP from our own proxy's X-Forwarded-For
//   4. session: refresh the access token when it is near expiry (single-flight per session)
//   5. call the API through the single API client; on 401 refresh once and retry (replayable bodies)
//   6. relay the response as a stream with allow-listed headers and Cache-Control: no-store

import type { ApiClient } from "./api-client";
import { buildDownstreamHeaders } from "./headers";
import { clientIpFromForwardedFor } from "./client-ip";
import { log, routeTemplate } from "./log";
import { problemResponse } from "./problem";
import {
  refreshSession,
  resultTtlMsForGrace,
  type RefreshContext,
  type RefreshOutcome,
} from "./refresh";
import {
  accessTokenNeedsRefresh,
  clearSessionCookieHeaders,
  cookieNames,
  parseCookieHeader,
  sessionCookieHeaders,
  type SessionTokens,
} from "./session";
import { checkMutationRequest, validateUpstreamSegments } from "./request-guards";
import { resolveTenant } from "./tenant";
import type { AppEnv } from "./env";

/** Request bodies up to this size are buffered so a 401 can be retried. Larger ones are streamed. */
export const REPLAYABLE_BODY_LIMIT = 1024 * 1024;
const API_TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;

export const UNAVAILABLE_SESSION = "unavailable" as const;

export interface BffDeps {
  env: Pick<
    AppEnv,
    | "APP_BASE_DOMAIN"
    | "APP_ORIGIN"
    | "TRUSTED_PROXY_COUNT"
    | "DEV_TENANT_SLUG"
    | "NODE_ENV"
    | "DOWNLOAD_ALLOWED_HOSTS"
    | "REFRESH_GRACE_SECONDS"
  >;
  api: ApiClient;
  /** Fetch used for absolute download URLs (never sent the BFF key or a token). */
  fetchExternal: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  logger?: typeof log;
}

export interface SessionState {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  /** New tokens obtained during this request; their cookies must be set on the response. */
  rotated: SessionTokens | null;
  /** The session is dead; clear cookies on the response. */
  invalid: boolean;
}

export function isSecureOrigin(appOrigin: string): boolean {
  return new URL(appOrigin).protocol === "https:";
}

export function tenantFor(deps: Pick<BffDeps, "env">, request: Request): string | null {
  return (
    resolveTenant({
      hostHeader: request.headers.get("host"),
      baseDomain: deps.env.APP_BASE_DOMAIN,
      devFallbackSlug: deps.env.DEV_TENANT_SLUG,
      isProduction: deps.env.NODE_ENV === "production",
    })?.slug ?? null
  );
}

/** The request's cookies, under the names this deployment uses. */
export function sessionFromCookies(deps: Pick<BffDeps, "env">, cookies: Record<string, string>) {
  const names = cookieNames(isSecureOrigin(deps.env.APP_ORIGIN));
  return { accessToken: cookies[names.access], refreshToken: cookies[names.refresh] };
}

function refreshContext(
  deps: BffDeps,
  request: Request,
  tenantSlug: string | null,
  clientIp: string | null,
  cookies: Record<string, string>,
): RefreshContext {
  const current = sessionFromCookies(deps, cookies);
  return {
    api: deps.api,
    resultTtlMs: resultTtlMsForGrace(deps.env.REFRESH_GRACE_SECONDS),
    tenantSlug,
    clientIp,
    inbound: request.headers,
    now: deps.now,
    sleep: deps.sleep,
    random: deps.random,
    // A request holds a snapshot of its cookies, so within this request this returns the same
    // values. A concurrent request in another instance writes new cookies to the browser, and
    // they are visible to the next request. See ADR 0003.
    readCurrentSession: () => current,
  };
}

async function ensureFreshSession(
  deps: BffDeps,
  request: Request,
  tenantSlug: string | null,
  clientIp: string | null,
  cookies: Record<string, string>,
): Promise<SessionState | typeof UNAVAILABLE_SESSION> {
  const { accessToken, refreshToken } = sessionFromCookies(deps, cookies);
  const state: SessionState = { accessToken, refreshToken, rotated: null, invalid: false };
  if (!refreshToken) return state; // anonymous call (login, OTP request, public pages)
  if (!accessTokenNeedsRefresh(state.accessToken, deps.now())) return state;

  const outcome = await refreshSession(
    refreshToken,
    refreshContext(deps, request, tenantSlug, clientIp, cookies),
  );
  return applyRefreshOutcome(state, outcome);
}

export function applyRefreshOutcome(
  state: SessionState,
  outcome: RefreshOutcome,
): SessionState | typeof UNAVAILABLE_SESSION {
  if (outcome.ok) {
    state.accessToken = outcome.tokens.accessToken;
    state.refreshToken = outcome.tokens.refreshToken;
    state.rotated = outcome.tokens;
    return state;
  }
  if (outcome.reason === "invalid") {
    state.accessToken = undefined;
    state.refreshToken = undefined;
    state.invalid = true;
    return state;
  }
  return UNAVAILABLE_SESSION;
}

function withSessionCookies(response: Response, state: SessionState, secure: boolean): Response {
  if (state.rotated) {
    for (const c of sessionCookieHeaders(state.rotated, { secure }))
      response.headers.append("Set-Cookie", c);
  } else if (state.invalid) {
    for (const c of clearSessionCookieHeaders({ secure })) response.headers.append("Set-Cookie", c);
  }
  return response;
}

export function sessionUnavailable(): Response {
  return problemResponse(
    503,
    "bff.session_unavailable",
    "Session temporarily unavailable",
    "Please try again in a moment.",
    { "Retry-After": "1" },
  );
}

/** Proxy any /api/bff/api/v1/... call. */
export async function handleProxy(
  request: Request,
  segments: readonly string[],
  deps: BffDeps,
): Promise<Response> {
  const started = deps.now();
  const method = request.method.toUpperCase();
  const secure = isSecureOrigin(deps.env.APP_ORIGIN);
  const logger = deps.logger ?? log;
  const finish = (res: Response, extra: { tenant: string | null }) => {
    logger("info", {
      event: "bff.proxy",
      method,
      route: routeTemplate(segments),
      status: res.status,
      ms: deps.now() - started,
      tenant: extra.tenant,
    });
    return res;
  };

  const guard = checkMutationRequest({
    method,
    headers: request.headers,
    appOrigin: deps.env.APP_ORIGIN,
  });
  if (!guard.ok)
    return finish(problemResponse(guard.status, guard.code, "Forbidden", guard.detail), {
      tenant: null,
    });

  const path = validateUpstreamSegments(segments);
  if (path === null)
    return finish(problemResponse(404, "bff.not_found", "Not found", "No such endpoint."), {
      tenant: null,
    });

  const tenantSlug = tenantFor(deps, request);
  const clientIp = clientIpFromForwardedFor(
    request.headers.get("x-forwarded-for"),
    deps.env.TRUSTED_PROXY_COUNT,
  );
  const cookies = parseCookieHeader(request.headers.get("cookie"));

  const session = await ensureFreshSession(deps, request, tenantSlug, clientIp, cookies);
  if (session === UNAVAILABLE_SESSION) return finish(sessionUnavailable(), { tenant: tenantSlug });

  // Bodies up to the limit are buffered so a 401 can be retried. Larger bodies are streamed once.
  const hasBody = method !== "GET" && method !== "HEAD";
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  const replayable = !hasBody || (declaredLength <= REPLAYABLE_BODY_LIMIT && request.body !== null);
  let body: BodyInit | null = null;
  if (hasBody && request.body !== null) {
    body = replayable ? await request.arrayBuffer() : request.body;
  }

  const search = new URL(request.url).search;
  const callUpstream = (accessToken: string | undefined) =>
    deps.api.call({
      method,
      path,
      search,
      inbound: request.headers,
      body,
      accessToken,
      tenantSlug,
      clientIp,
      timeoutMs: API_TIMEOUT_MS,
      signal: request.signal,
    });

  let upstream: Response;
  try {
    upstream = await callUpstream(session.accessToken);
  } catch (err) {
    const timedOut =
      err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    return finish(
      timedOut
        ? problemResponse(
            504,
            "bff.upstream_timeout",
            "Gateway timeout",
            "The school system took too long to respond.",
          )
        : problemResponse(
            502,
            "bff.upstream_unavailable",
            "Bad gateway",
            "The school system is unreachable.",
          ),
      { tenant: tenantSlug },
    );
  }

  // One refresh-and-retry on 401, only when we hold a refresh token and the body can be replayed.
  if (upstream.status === 401 && session.refreshToken && replayable && !session.invalid) {
    await upstream.body?.cancel();
    const outcome = await refreshSession(
      session.refreshToken,
      refreshContext(deps, request, tenantSlug, clientIp, cookies),
    );
    const next = applyRefreshOutcome(session, outcome);
    if (next === UNAVAILABLE_SESSION) return finish(sessionUnavailable(), { tenant: tenantSlug });
    if (next.invalid) {
      return finish(
        withSessionCookies(
          problemResponse(
            401,
            "bff.session_ended",
            "Signed out",
            "Your session has ended. Please sign in again.",
          ),
          next,
          secure,
        ),
        { tenant: tenantSlug },
      );
    }
    upstream = await callUpstream(next.accessToken);
    return finish(withSessionCookies(relay(upstream), next, secure), { tenant: tenantSlug });
  }

  return finish(withSessionCookies(relay(upstream), session, secure), { tenant: tenantSlug });
}

/** Stream the upstream body straight through with allowlisted headers. Nothing is buffered. */
export function relay(upstream: Response): Response {
  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildDownstreamHeaders(upstream.headers),
  });
}

export interface DownloadRequest {
  /** API-relative path such as api/v1/invoices/{id}/pdf (sent with the session). */
  path?: string;
  /** Absolute presigned URL on an allow-listed storage host (sent with no credentials). */
  url?: string;
}

/** Parse the download request body. Exactly one of `path` or `url`. */
export function parseDownloadRequest(raw: unknown): DownloadRequest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const hasPath = typeof r.path === "string";
  const hasUrl = typeof r.url === "string";
  if (hasPath === hasUrl) return null;
  if (hasPath) return { path: r.path as string };
  return { url: r.url as string };
}

/**
 * Stream a file. Relative paths use the session. Absolute URLs are fetched without credentials and
 * only from DOWNLOAD_ALLOWED_HOSTS, so the route cannot be used to reach internal hosts (SSRF).
 */
export async function handleDownload(
  request: Request,
  requested: DownloadRequest,
  deps: BffDeps,
): Promise<Response> {
  const method = request.method.toUpperCase();
  const guard = checkMutationRequest({
    method,
    headers: request.headers,
    appOrigin: deps.env.APP_ORIGIN,
  });
  if (!guard.ok) return problemResponse(guard.status, guard.code, "Forbidden", guard.detail);

  const secure = isSecureOrigin(deps.env.APP_ORIGIN);
  const tenantSlug = tenantFor(deps, request);
  const clientIp = clientIpFromForwardedFor(
    request.headers.get("x-forwarded-for"),
    deps.env.TRUSTED_PROXY_COUNT,
  );

  if (requested.path !== undefined) {
    if (requested.path.includes("?") || requested.path.includes("#")) {
      return problemResponse(400, "bff.download_invalid", "Invalid download", "Path is not valid.");
    }
    const segments = requested.path.replace(/^\/+/, "").split("/");
    const path = validateUpstreamSegments(segments);
    if (path === null)
      return problemResponse(400, "bff.download_invalid", "Invalid download", "Path is not valid.");
    const cookies = parseCookieHeader(request.headers.get("cookie"));
    const session = await ensureFreshSession(deps, request, tenantSlug, clientIp, cookies);
    if (session === UNAVAILABLE_SESSION) return sessionUnavailable();
    let upstream = await apiGet(deps, path, session.accessToken, request, tenantSlug, clientIp);
    if (upstream === null)
      return problemResponse(
        502,
        "bff.upstream_unavailable",
        "Bad gateway",
        "The school system is unreachable.",
      );
    if (upstream.status === 401 && session.refreshToken && !session.invalid) {
      await upstream.body?.cancel();
      const next = applyRefreshOutcome(
        session,
        await refreshSession(
          session.refreshToken,
          refreshContext(deps, request, tenantSlug, clientIp, cookies),
        ),
      );
      if (next === UNAVAILABLE_SESSION) return sessionUnavailable();
      upstream =
        (await apiGet(deps, path, next.accessToken, request, tenantSlug, clientIp)) ?? upstream;
      return withSessionCookies(streamFile(upstream), next, secure);
    }
    return withSessionCookies(streamFile(upstream), session, secure);
  }

  // Absolute presigned URL: no session, no BFF key, allow-listed host, HTTPS, no redirects.
  const target = parseAbsoluteDownload(
    requested.url ?? "",
    deps.env.DOWNLOAD_ALLOWED_HOSTS,
    deps.env.NODE_ENV,
  );
  if (target === null)
    return problemResponse(
      400,
      "bff.download_host_not_allowed",
      "Invalid download",
      "This file cannot be downloaded.",
    );
  let res: Response;
  try {
    res = await deps.fetchExternal(target.href, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: { Accept: "*/*" },
    });
  } catch {
    return problemResponse(
      502,
      "bff.download_unavailable",
      "Bad gateway",
      "The file could not be fetched.",
    );
  }
  if (!res.ok) {
    await res.body?.cancel();
    return problemResponse(
      502,
      "bff.download_unavailable",
      "Bad gateway",
      "The file could not be fetched.",
    );
  }
  return streamFile(res);
}

async function apiGet(
  deps: BffDeps,
  path: string,
  accessToken: string | undefined,
  request: Request,
  tenantSlug: string | null,
  clientIp: string | null,
): Promise<Response | null> {
  try {
    return await deps.api.call({
      method: "GET",
      path,
      inbound: request.headers,
      accessToken,
      tenantSlug,
      clientIp,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      signal: request.signal,
    });
  } catch {
    return null;
  }
}

/** Stream a file to the browser. Content-Disposition is always set; the body is never buffered. */
export function streamFile(upstream: Response): Response {
  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  headers.set(
    "Content-Disposition",
    sanitizeDisposition(upstream.headers.get("content-disposition")),
  );
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(upstream.body, { status: upstream.status, headers });
}

/** Keep the upstream filename when present, otherwise use a safe default. Always an attachment. */
export function sanitizeDisposition(raw: string | null): string {
  const fallback = 'attachment; filename="download"';
  if (!raw) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(raw);
  const name = match?.[1]?.replace(/[^A-Za-z0-9._ -]/g, "_").trim();
  return name ? `attachment; filename="${name.slice(0, 120)}"` : fallback;
}

/** Validate an absolute download URL against the allow-list. Returns the parsed URL or null. */
export function parseAbsoluteDownload(
  raw: string,
  allowedHosts: readonly string[],
  nodeEnv: string,
): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const httpsOk =
    url.protocol === "https:" || (nodeEnv !== "production" && url.protocol === "http:");
  if (!httpsOk) return null;
  if (url.username || url.password) return null;
  if (!allowedHosts.includes(url.hostname.toLowerCase())) return null;
  return url;
}
