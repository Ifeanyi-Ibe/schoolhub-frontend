// Header allowlists for the BFF. Nothing else crosses the boundary in either direction, so
// inbound X-Forwarded-*, X-Tenant, Cookie and Authorization never reach the API unless we add
// them ourselves.

/** Request headers the browser may send that we forward to the API. */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "content-length",
  "if-match",
  "if-none-match",
  "idempotency-key",
] as const;

/** Response headers the API may send back to the browser. Set-Cookie is never forwarded. */
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "content-length",
  "etag",
  "retry-after",
  "idempotency-replayed",
] as const;

const MAX_USER_AGENT = 256;

/** Strip control characters and cap length, so the forwarded UA cannot smuggle headers. */
export function sanitizeUserAgent(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.length > 0 ? cleaned.slice(0, MAX_USER_AGENT) : null;
}

export interface UpstreamHeaderInput {
  inbound: Headers;
  bffKey: string;
  tenantSlug: string | null;
  clientIp: string | null;
  accessToken?: string | undefined;
}

/** Build the header set for one call to the .NET API. */
export function buildUpstreamHeaders(input: UpstreamHeaderInput): Headers {
  const out = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = input.inbound.get(name);
    if (value !== null) out.set(name, value);
  }
  out.set("X-Bff-Key", input.bffKey);
  if (input.tenantSlug) out.set("X-Tenant", input.tenantSlug);
  if (input.clientIp) out.set("X-Forwarded-For", input.clientIp);
  const ua = sanitizeUserAgent(input.inbound.get("user-agent"));
  if (ua) out.set("X-Client-User-Agent", ua);
  if (input.accessToken) out.set("Authorization", `Bearer ${input.accessToken}`);
  return out;
}

/** Copy only the allowlisted response headers, and force no-store on everything we relay. */
export function buildDownstreamHeaders(upstream: Headers): Headers {
  const out = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.get(name);
    if (value !== null) out.set(name, value);
  }
  out.set("Cache-Control", "no-store");
  return out;
}
