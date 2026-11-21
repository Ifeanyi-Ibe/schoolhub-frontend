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
    <Branded slug={tenant.slug} branding={result.branding} panel={await brandPanel()}>
      {children}
    </Branded>
  );
}

function Branded({
  slug,
  branding,
  panel,
  children,
}: {
  slug: string;
  branding: SchoolBranding;
  panel: { headline: string; body: string; product: string };
  children: ReactNode;
}) {
  const logo = branding.logoUrl ? (
    // A plain <img>: next/image adds an inline style attribute, which the CSP does not allow.
    // The logo is a tenant asset served by the BFF, with fixed dimensions.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/bff/api/v1/public/tenants/${slug}/logo`}
      alt={`${branding.name} logo`}
      width={56}
      height={56}
      loading="eager"
      decoding="async"
      className="size-14 rounded-control bg-surface object-contain p-1"
    />
  ) : (
    <span
      aria-hidden="true"
      className="inline-flex size-14 items-center justify-center rounded-control bg-surface font-display text-xl font-bold text-brand"
    >
      {branding.name.trim().charAt(0).toUpperCase() || "S"}
    </span>
  );
  return (
    <div className="tenant-brand grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Same-origin stylesheet: the school's colours, validated by the route. See tenant-brand.css/route.ts. */}
      {/* A per-tenant stylesheet cannot be imported statically, so this is the one manual link. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/tenant-brand.css" precedence="default" />
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand/25 blur-3xl"
        />
        <div className="relative flex items-center gap-4">
          {logo}
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold">{branding.name}</p>
            {branding.motto ? <p className="text-sm text-sidebar-muted">{branding.motto}</p> : null}
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-3xl font-semibold leading-tight">{panel.headline}</p>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-muted">{panel.body}</p>
        </div>
        <p className="relative text-xs text-sidebar-muted">{panel.product}</p>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="mx-auto flex w-full max-w-md items-center gap-3 px-4 pt-8 lg:hidden">
          {logo}
          <div className="flex min-w-0 flex-col">
            <p className="font-display text-lg font-semibold text-foreground">{branding.name}</p>
            {branding.motto ? (
              <p className="text-sm text-muted-foreground">{branding.motto}</p>
            ) : null}
          </div>
        </header>
        <main
          id="main"
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 lg:px-10"
        >
          <div className="rounded-card border border-border bg-surface p-6 shadow-raised sm:p-8">
            {children}
          </div>
        </main>
      </div>
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

async function brandPanel() {
  const t = await getTranslations("auth.brandPanel");
  return { headline: t("headline"), body: t("body"), product: t("product") };
}
