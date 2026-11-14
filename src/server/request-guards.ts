// CSRF defence and path validation for the BFF.

/** Custom header every state-changing browser request must carry. Browsers cannot send it
 * cross-site without a CORS preflight, which we never allow. */
export const CSRF_HEADER = "x-schoolhub-request";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type GuardResult = { ok: true } | { ok: false; status: 403; code: string; detail: string };

/**
 * Mutating requests must (1) carry the custom header, (2) carry an Origin that equals our own
 * origin, and (3) not be marked cross-site by the browser.
 */
export function checkMutationRequest(input: {
  method: string;
  headers: Headers;
  appOrigin: string;
}): GuardResult {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return { ok: true };
  if (input.headers.get(CSRF_HEADER) !== "1") {
    return {
      ok: false,
      status: 403,
      code: "bff.csrf_header_missing",
      detail: "Missing request header.",
    };
  }
  const origin = input.headers.get("origin");
  if (!origin) {
    return { ok: false, status: 403, code: "bff.origin_missing", detail: "Missing Origin header." };
  }
  if (origin !== new URL(input.appOrigin).origin) {
    return {
      ok: false,
      status: 403,
      code: "bff.origin_mismatch",
      detail: "Request origin is not allowed.",
    };
  }
  if (input.headers.get("sec-fetch-site") === "cross-site") {
    return {
      ok: false,
      status: 403,
      code: "bff.cross_site",
      detail: "Cross-site requests are not allowed.",
    };
  }
  return { ok: true };
}

const SAFE_SEGMENT = /^[A-Za-z0-9._~-]+$/;

/**
 * Validate the catch-all path. Only `api/v1/...` is proxied, and each segment must be a plain
 * token. Encoded separators, dot segments and empty segments are refused, so the path cannot
 * escape the API base.
 */
export function validateUpstreamSegments(segments: readonly string[]): string | null {
  if (segments.length < 3) return null;
  if (segments[0] !== "api" || segments[1] !== "v1") return null;
  for (const s of segments) {
    if (!SAFE_SEGMENT.test(s) || s === "." || s === "..") return null;
  }
  return segments.join("/");
}
