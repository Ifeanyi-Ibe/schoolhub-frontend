// The school's brand colours as a same-origin stylesheet. A <style> element carries a per-request
// nonce, which a client-side navigation cannot match (the document's CSP holds the nonce of its own
// response). style-src 'self' allows this stylesheet without one. The school comes from the host only,
// and the colour passes the strict #RRGGBB check and the contrast guard (brand-css.ts).
import { createBffDeps } from "@/server/deps";
import { getEnv } from "@/server/env";
import { loadBranding } from "@/server/branding";
import { resolveTenant } from "@/server/tenant";
import { brandStyleSheet } from "@/lib/theme/brand-css";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const tenant = resolveTenant({
    hostHeader: request.headers.get("host"),
    baseDomain: env.APP_BASE_DOMAIN,
    devFallbackSlug: env.DEV_TENANT_SLUG,
    isProduction: env.NODE_ENV === "production",
  });
  let css = "";
  if (tenant) {
    const result = await loadBranding(createBffDeps(), tenant.slug);
    if (result.status === "ok") css = brandStyleSheet(result.branding.primaryColor) ?? "";
  }
  return new Response(css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
