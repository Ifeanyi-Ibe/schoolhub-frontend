// The ONLY module that calls the .NET API from the server. Every upstream request goes through
// `call()`, so the BFF key, tenant, client IP and header allowlists are applied in one place.

import { buildUpstreamHeaders } from "./headers";

export interface ApiClientConfig {
  /** API origin and optional path prefix, without a trailing slash. */
  apiBaseUrl: string;
  bffKey: string;
}

export interface UpstreamCall {
  method: string;
  /** Path under the API base, for example `api/v1/students`. Already validated by the caller. */
  path: string;
  /** Raw query string including the leading `?`, or empty. */
  search?: string;
  /** Headers from the browser; only allowlisted ones are forwarded. */
  inbound: Headers;
  body?: BodyInit | null;
  accessToken?: string | undefined;
  tenantSlug: string | null;
  clientIp: string | null;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
}

export type FetchLike = (
  input: string,
  init: RequestInit & { duplex?: "half" },
) => Promise<Response>;

export interface ApiClient {
  call(call: UpstreamCall): Promise<Response>;
}

export function createApiClient(
  config: ApiClientConfig,
  fetchImpl: FetchLike = globalThis.fetch,
): ApiClient {
  const base = config.apiBaseUrl.replace(/\/+$/, "");
  return {
    async call(call) {
      const url = `${base}/${call.path}${call.search ?? ""}`;
      const headers = buildUpstreamHeaders({
        inbound: call.inbound,
        bffKey: config.bffKey,
        tenantSlug: call.tenantSlug,
        clientIp: call.clientIp,
        accessToken: call.accessToken,
      });
      const timeout = AbortSignal.timeout(call.timeoutMs);
      const signal = call.signal ? AbortSignal.any([call.signal, timeout]) : timeout;
      const init: RequestInit & { duplex?: "half" } = {
        method: call.method,
        headers,
        body: call.body ?? null,
        // Never follow redirects: a redirect could send the BFF key and token somewhere else.
        redirect: "manual",
        cache: "no-store",
        signal,
      };
      // A streamed request body needs duplex: "half" in Node's fetch.
      if (call.body && typeof (call.body as ReadableStream).getReader === "function") {
        init.duplex = "half";
      }
      return fetchImpl(url, init);
    },
  };
}
