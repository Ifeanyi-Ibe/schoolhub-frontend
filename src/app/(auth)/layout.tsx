// Sign-in layout: the school's own branding, read on the server from the host. The school comes
// from the Host header only. Colours pass the contrast guard before they are applied.
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { createBffDeps } from "@/server/deps";
import { getEnv } from "@/server/env";
import { loadBranding, type SchoolBranding } from "@/server/branding";
import { resolveTenant } from "@/server/tenant";

// The sign-in background: the school's own colour (--brand, set per school), darkened toward black, so the white
// text keeps its contrast whatever colour the school picks. Only classes are used (no inline style),
// because the Content-Security-Policy does not allow style attributes.
const BRAND_GRADIENT =
  "bg-[linear-gradient(150deg,color-mix(in_oklab,var(--brand)_80%,white)_0%,var(--brand)_42%,color-mix(in_oklab,var(--brand)_60%,black)_78%,color-mix(in_oklab,var(--brand)_35%,black)_100%)]";
const BRAND_LIGHT = "bg-[radial-gradient(circle_at_85%_0%,rgb(255_255_255/0.16),transparent_55%)]";
const BRAND_DOTS =
  "bg-[radial-gradient(rgb(255_255_255/0.12)_1px,transparent_1px)] bg-[length:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]";

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
  panel: BrandPanel;
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
      <aside
        className={`${BRAND_GRADIENT} relative hidden overflow-hidden p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between`}
      >
        {/* Soft light from the top corner, a faint dot grid fading down, and an edge highlight: depth without images. */}
        <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${BRAND_LIGHT}`} />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 opacity-60 ${BRAND_DOTS}`}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-brand/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 size-[22rem] rounded-full bg-brand/20 blur-3xl"
        />
        <div className="relative flex items-center gap-4">
          {logo}
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold">{branding.name}</p>
            {branding.motto ? <p className="text-sm text-sidebar-muted">{branding.motto}</p> : null}
          </div>
        </div>
        <div className="relative max-w-lg">
          <p className="font-display text-4xl font-semibold leading-tight tracking-tight">
            {panel.headline}
          </p>
          <p className="mt-4 text-base leading-relaxed text-sidebar-muted">{panel.body}</p>
          <div className="mt-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sidebar-muted">
              {panel.pointsLabel}
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {panel.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm leading-relaxed">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-sidebar-foreground/80 shadow-[0_0_0_4px_rgb(255_255_255/0.12)]"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="relative text-xs tracking-wide text-sidebar-muted">{panel.product}</p>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header
          className={`${BRAND_GRADIENT} relative overflow-hidden text-sidebar-foreground lg:hidden`}
        >
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${BRAND_LIGHT}`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 opacity-60 ${BRAND_DOTS}`}
          />
          <div className="relative mx-auto flex w-full max-w-md items-center gap-3 px-4 pb-14 pt-8">
            {logo}
            <div className="flex min-w-0 flex-col">
              <p className="font-display text-lg font-semibold">{branding.name}</p>
              {branding.motto ? (
                <p className="text-sm text-sidebar-muted">{branding.motto}</p>
              ) : null}
            </div>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto -mt-8 flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-10 lg:mt-0 lg:px-10 lg:py-10"
        >
          <div className="relative overflow-hidden rounded-card border border-border bg-surface p-6 shadow-raised sm:p-8">
            {/* A brand strip across the top of the card, so the form reads as this school's sign-in. */}
            <div
              aria-hidden="true"
              className={`${BRAND_GRADIENT} absolute inset-x-0 top-0 h-1.5`}
            />
            <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-brand" />
              {panel.welcome}
            </p>
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

interface BrandPanel {
  headline: string;
  body: string;
  product: string;
  pointsLabel: string;
  welcome: string;
  points: string[];
}

async function brandPanel(): Promise<BrandPanel> {
  const t = await getTranslations("auth.brandPanel");
  return {
    headline: t("headline"),
    body: t("body"),
    product: t("product"),
    pointsLabel: t("pointsLabel"),
    welcome: t("welcome"),
    points: [t("points.students"), t("points.staff"), t("points.secure")],
  };
}
