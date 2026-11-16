// Sign-in layout: the school's own branding, read on the server from the host. The school comes
// from the Host header only. Colours pass the contrast guard before they are applied.
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { createBffDeps } from "@/server/deps";
import { getEnv } from "@/server/env";
import { loadBranding, type SchoolBranding } from "@/server/branding";
import { resolveTenant } from "@/server/tenant";

// Sign-in screens read their text through the light formatter (root layout), so no next-intl code ships
// here. Server-side text (getTranslations) stays on the server.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const env = getEnv();
  const h = await headers();
  const tenant = resolveTenant({
    hostHeader: h.get("host"),
    baseDomain: env.APP_BASE_DOMAIN,
    devFallbackSlug: env.DEV_TENANT_SLUG,
    isProduction: env.NODE_ENV === "production",
  });
  const t = await getTranslations("auth.schoolMissing");
  if (!tenant) return <Frame title={t("title")} body={t("body")} />;

  const result = await loadBranding(createBffDeps(), tenant.slug);
  if (result.status === "not_found") return <Frame title={t("title")} body={t("body")} />;
  if (result.status === "unavailable") {
    const tc = await getTranslations("auth.login");
    return <Frame title={tc("unavailable")} body="" />;
  }
  return (
    <Branded slug={tenant.slug} branding={result.branding}>
      {children}
    </Branded>
  );
}

function Branded({
  slug,
  branding,
  children,
}: {
  slug: string;
  branding: SchoolBranding;
  children: ReactNode;
}) {
  return (
    <div className="tenant-brand min-h-dvh bg-background">
      {/* Same-origin stylesheet: the school's colours, validated by the route. See tenant-brand.css/route.ts. */}
      {/* A per-tenant stylesheet cannot be imported statically, so this is the one manual link. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/tenant-brand.css" precedence="default" />
      <header className="mx-auto flex max-w-md items-center gap-3 px-4 pt-8">
        {branding.logoUrl ? (
          // A plain <img>: next/image adds an inline style attribute, which the CSP does not allow.
          // The logo is a tenant asset served by the BFF, with fixed dimensions.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/bff/api/v1/public/tenants/${slug}/logo`}
            alt={`${branding.name} logo`}
            width={48}
            height={48}
            loading="eager"
            decoding="async"
            className="size-12 rounded-control object-contain"
          />
        ) : null}
        <div className="flex flex-col">
          <p className="font-display text-lg font-semibold text-foreground">{branding.name}</p>
          {branding.motto ? (
            <p className="text-sm text-muted-foreground">{branding.motto}</p>
          ) : null}
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-md px-4 py-8">
        {children}
      </main>
    </div>
  );
}

function Frame({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
      {body ? <p className="text-muted-foreground">{body}</p> : null}
    </main>
  );
}
