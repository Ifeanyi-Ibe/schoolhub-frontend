# ADR 0006: BFF boundary, headers and downloads

Status: accepted (F0).

## Decisions

1. **One outbound module.** `src/server/api-client.ts` is the only code that calls the .NET API. Every request gets the BFF key, the tenant, and the client IP from the same place. Route handlers never call `fetch` for the API.
2. **Allow-list headers in both directions.**
   - Forwarded to the API: `Accept`, `Content-Type`, `Content-Length`, `If-Match`, `If-None-Match`, `Idempotency-Key`, plus the BFF's own `X-Bff-Key`, `X-Tenant`, `X-Forwarded-For`, `X-Client-User-Agent`, and `Authorization` from the cookie.
   - Returned to the browser: `Content-Type`, `Content-Disposition`, `Content-Length`, `ETag`, `Retry-After`, `Idempotency-Replayed`. `Cache-Control` is forced to `no-store`. `Set-Cookie` from upstream is never relayed.
   - Inbound `Cookie`, `Authorization`, `X-Tenant`, `X-Forwarded-*` and `X-Forwarded-Host` never reach the API.
3. **Tenant from the host only.** The tenant slug comes from `{slug}.{APP_BASE_DOMAIN}` (or `DEV_TENANT_SLUG` outside production). The browser cannot choose a tenant with a header. Backend behaviour checked: an unknown `X-Tenant` returns 404 `tenancy.not_found` with `code` and `traceId`.
4. **Client IP only through our own proxy.** `TRUSTED_PROXY_COUNT` says how many hops of `X-Forwarded-For` we added. The client IP is the entry that many positions from the right. Entries to its left are ignored. With `0` (the default), no IP is forwarded.
5. **CSRF defence for mutations.** A mutating request needs the custom header `X-SchoolHub-Request: 1`, an `Origin` equal to `APP_ORIGIN`, and not be marked `Sec-Fetch-Site: cross-site`. Cross-site custom headers need a CORS preflight, which we never allow.
6. **Host-only cookies.** `sh_at` and `sh_rt` have no `Domain` attribute, so each school's cookies stay on that school's host. They are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` on HTTPS.
7. **Downloads stream and are fenced.**
   - Relative paths use the session (`api/v1/...`). Absolute URLs are fetched with no credentials, only over HTTPS (HTTP only outside production), only from `DOWNLOAD_ALLOWED_HOSTS`, with no embedded credentials and no redirects. This blocks SSRF to internal hosts such as cloud metadata endpoints.
   - Responses stream with no buffering. `Content-Disposition` is always an attachment with a sanitised filename, and `X-Content-Type-Options: nosniff` is set.
8. **Paths are validated.** Only `api/v1/...` plain segments are proxied. Encoded separators, dot segments and empty segments are refused before anything is sent upstream.
9. **Logs never hold secrets or identifiers.** Log fields are redacted by name, and route templates replace GUIDs and numbers with `:id` and `:n`. Query strings are never logged.

## Consequences

- The BFF key is a shared secret. It is read from the environment, is at least 16 characters, and is never logged. Rotation is a deployment step.
- Any new header that must reach the API has to be added to the allow-list in `src/server/headers.ts`, with a test.
