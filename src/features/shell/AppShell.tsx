"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLightTranslations } from "@/i18n/light-provider";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { LogOutIcon } from "@/components/ui/icons";
import { ApiError } from "@/lib/api/unwrap";
import { isBillingSuspended, subscribeBillingSuspended } from "@/lib/api/billing-events";
import { meQuery, tenantQuery } from "./api";
import { NAV_ITEMS, visibleNav, type NavItem } from "./nav";
import { ReadOnlyProvider } from "./read-only";
import { signOut } from "./sign-out";

/**
 * The signed-in frame. Desktop: a sidebar with navigation, the school and the account. Mobile: a top
 * bar and a bottom bar of icons (44px targets). Navigation is filtered by effective permissions from
 * GET /me; writes are disabled while the school is read-only.
 */
export function AppShell({
  children,
  schoolName,
}: {
  children: ReactNode;
  schoolName: string | null;
}) {
  const t = useLightTranslations("shell");
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const billingSuspended = useSyncExternalStore(
    subscribeBillingSuspended,
    isBillingSuspended,
    () => false,
  );

  const me = useQuery({ ...meQuery, retry: false });
  // Requested in parallel with the user: one round trip, not two in sequence.
  const tenant = useQuery({ ...tenantQuery, retry: false });

  const sessionEnded = me.error instanceof ApiError && me.error.problem.status === 401;
  useEffect(() => {
    if (sessionEnded) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [sessionEnded, pathname, router]);

  const readOnly = billingSuspended || Boolean(tenant.data?.suspended);
  const nav = visibleNav(NAV_ITEMS, me.data?.permissions ?? []);
  const school = schoolName ?? tenant.data?.branding?.name ?? "SchoolHub";
  // The school's logo, through the BFF (the tenant summary holds the API path). Absent, the initial stands in.
  const schoolLogo = tenant.data?.branding?.logoUrl
    ? `/api/bff${tenant.data.branding.logoUrl}`
    : null;

  async function onSignOut() {
    await signOut({ queryClient }).catch(() => undefined);
    router.replace("/login?signedOut=1");
  }

  return (
    <ReadOnlyProvider readOnly={readOnly}>
      <div className="flex min-h-dvh bg-background">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-[linear-gradient(180deg,color-mix(in_oklab,var(--brand)_38%,var(--sidebar))_0%,var(--sidebar)_34%)] text-sidebar-foreground md:flex">
          <div className="flex items-center gap-3 px-5 pb-6 pt-6">
            <BrandMark name={school} logoUrl={schoolLogo} />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold">{school}</p>
              <p className="text-xs text-sidebar-muted">SchoolHub</p>
            </div>
          </div>
          <nav aria-label={t("menu")} className="flex-1 overflow-y-auto px-3">
            <ul className="flex flex-col gap-1">
              {nav.map((item) => (
                <li key={item.id}>
                  <NavLink item={item} current={pathname === item.href} variant="sidebar" t={t} />
                </li>
              ))}
            </ul>
          </nav>
          {me.data ? (
            <div className="m-3 flex items-center gap-3 rounded-card bg-sidebar-active p-3">
              <Avatar name={me.data.displayName} size="sm" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{me.data.displayName}</p>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex size-11 items-center justify-center rounded-control text-sidebar-muted transition-colors hover:bg-sidebar hover:text-sidebar-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label={t("signOut")}
              >
                <LogOutIcon className="size-5" />
              </button>
            </div>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark name={school} logoUrl={schoolLogo} small />
              <p className="truncate font-display text-base font-semibold text-foreground">
                {school}
              </p>
            </div>
            {me.data ? (
              <div className="flex shrink-0 items-center gap-1">
                <Avatar name={me.data.displayName} size="sm" />
                <Button variant="ghost" size="icon" onClick={onSignOut} aria-label={t("signOut")}>
                  <LogOutIcon className="size-5" />
                </Button>
              </div>
            ) : null}
          </header>

          <nav
            aria-label={t("menu")}
            className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            <ul className="mx-auto flex max-w-xl justify-around gap-1 px-2">
              {nav.map((item) => (
                <li key={item.id} className="min-w-0 flex-1">
                  <NavLink item={item} current={pathname === item.href} variant="bottom" t={t} />
                </li>
              ))}
            </ul>
          </nav>

          {readOnly ? (
            <Banner tone="danger" assertive title={t("billingTitle")}>
              {t("billingBody")}
            </Banner>
          ) : tenant.data?.pastDue ? (
            <Banner tone="warning" title={t("pastDueTitle")}>
              {t("pastDueBody")}
            </Banner>
          ) : null}

          <main
            id="main"
            className="mx-auto w-full max-w-6xl flex-1 bg-[radial-gradient(60rem_28rem_at_100%_-8%,color-mix(in_oklab,var(--brand)_10%,transparent),transparent_70%)] px-4 pb-28 pt-6 md:px-10 md:pb-12 md:pt-10"
          >
            {me.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">
                {t("loading")}
              </p>
            ) : null}
            {me.isError && !sessionEnded ? (
              <p role="alert" className="text-sm text-danger-foreground">
                {t("loadFailed")}
              </p>
            ) : null}
            {/* Pages render their own heading and skeleton while the account loads (the BFF gates data). */}
            {children}
          </main>
        </div>
      </div>
    </ReadOnlyProvider>
  );
}

function BrandMark({
  name,
  logoUrl,
  small = false,
}: {
  name: string;
  logoUrl: string | null;
  small?: boolean;
}) {
  const size = small ? "size-8" : "size-10";
  if (logoUrl) {
    // A plain <img>: next/image adds an inline style attribute, which the CSP does not allow.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        className={`${size} shrink-0 rounded-control bg-surface object-contain p-0.5`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-control bg-brand font-display font-bold text-on-brand ${small ? "size-8 text-sm" : "size-10 text-base"}`}
    >
      {name.trim().charAt(0).toUpperCase() || "S"}
    </span>
  );
}

function NavLink({
  item,
  current,
  variant,
  t,
}: {
  item: NavItem;
  current: boolean;
  variant: "sidebar" | "bottom";
  t: (key: string) => string;
}) {
  const Icon = item.icon;
  const label = t(`nav.${item.id}`);
  if (variant === "sidebar") {
    return (
      <Link
        href={item.href}
        aria-current={current ? "page" : undefined}
        className={`group relative flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${current ? "bg-sidebar-active text-sidebar-foreground" : "text-sidebar-muted hover:bg-sidebar-active/60 hover:text-sidebar-foreground"}`}
      >
        {current ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand"
          />
        ) : null}
        <Icon className="size-5 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-control px-1 text-[0.7rem] font-medium leading-tight focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${current ? "text-brand" : "text-muted-foreground"}`}
    >
      <Icon className="size-5" />
      <span className="line-clamp-2 max-w-full text-center leading-tight break-words">{label}</span>
    </Link>
  );
}
