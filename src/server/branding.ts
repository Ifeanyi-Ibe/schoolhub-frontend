// Public school branding, read server-side for the sign-in page and the app shell.
// Anonymous by slug (backend ADR 0028). The school comes from the host, never from the browser.
import { z } from "zod";
import type { components } from "@/lib/api/schema";
import type { BffDeps } from "./bff-proxy";

export type SchoolBranding = components["schemas"]["SchoolBrandingView"];

const brandingBody = z.object({
  name: z.string().min(1),
  logoUrl: z.string().nullable(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  motto: z.string().nullable(),
  supportEmail: z.string().nullable(),
  supportPhone: z.string().nullable(),
});

export type BrandingResult =
  { status: "ok"; branding: SchoolBranding } | { status: "not_found" } | { status: "unavailable" };

export async function loadBranding(
  deps: Pick<BffDeps, "api">,
  slug: string,
): Promise<BrandingResult> {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return { status: "not_found" };
  let res: Response;
  try {
    res = await deps.api.call({
      method: "GET",
      path: `api/v1/public/tenants/${slug}/branding`,
      inbound: new Headers({ accept: "application/json" }),
      tenantSlug: slug,
      clientIp: null,
      timeoutMs: 5_000,
    });
  } catch {
    return { status: "unavailable" };
  }
  if (res.status === 404) {
    await res.body?.cancel();
    return { status: "not_found" };
  }
  if (!res.ok) {
    await res.body?.cancel();
    return { status: "unavailable" };
  }
  const parsed = brandingBody.safeParse(await res.json().catch(() => undefined));
  return parsed.success ? { status: "ok", branding: parsed.data } : { status: "unavailable" };
}
