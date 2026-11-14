// Tenant resolution from the request host (CLAUDE.md §7.2 / brief).
// Production: {slug}.{APP_BASE_DOMAIN}. Local dev: {slug}.localhost:3000.
// The tenant comes from the Host header only. Inbound X-Tenant is never read from the internet.

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Subdomains that are never schools (infrastructure and marketing hosts). */
const RESERVED = new Set([
  "www",
  "api",
  "admin",
  "app",
  "platform",
  "mail",
  "static",
  "assets",
  "dev",
]);

export interface TenantResolution {
  slug: string;
  source: "host" | "dev-fallback";
}

/** Lowercase host without port. Returns null for anything that is not a plain host name. */
export function normalizeHost(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed.startsWith("[")) return null; // IPv6 literals never carry a tenant
  const host = trimmed.replace(/:\d{1,5}$/, "");
  return host.length > 0 && host.length <= 253 ? host : null;
}

/**
 * Resolve the school slug for a host.
 * - `{slug}.{base}` → slug (single label, not reserved).
 * - the apex (`base` itself) or anything else → no tenant, unless the dev fallback applies.
 * - the dev fallback is used only outside production and only when the host names no school.
 */
export function resolveTenant(input: {
  hostHeader: string | null | undefined;
  baseDomain: string;
  devFallbackSlug?: string | undefined;
  isProduction: boolean;
}): TenantResolution | null {
  const host = normalizeHost(input.hostHeader);
  const base = input.baseDomain.toLowerCase();
  if (host !== null && host.endsWith(`.${base}`)) {
    const label = host.slice(0, host.length - base.length - 1);
    if (LABEL.test(label) && !RESERVED.has(label)) {
      return { slug: label, source: "host" };
    }
  }
  if (!input.isProduction && input.devFallbackSlug && LABEL.test(input.devFallbackSlug)) {
    return { slug: input.devFallbackSlug, source: "dev-fallback" };
  }
  return null;
}
