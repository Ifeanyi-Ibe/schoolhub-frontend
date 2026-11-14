"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/unwrap";
import { isBillingSuspended, subscribeBillingSuspended } from "@/lib/api/billing-events";
import { meQuery, tenantQuery } from "./api";
import { NAV_ITEMS, visibleNav } from "./nav";
import { ReadOnlyProvider } from "./read-only";
import { signOut } from "./sign-out";

/**
 * The signed-in frame: navigation filtered by permission, the school's name, banners for
 * read-only and overdue accounts, and sign-out. Writes are disabled while read-only.
 */
export function AppShell({
  children,
  schoolName,
}: {
  children: ReactNode;
  schoolName: string | null;
}) {
  const t = useTranslations("shell");
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

  async function onSignOut() {
    await signOut({ queryClient }).catch(() => undefined);
    router.replace("/login?signedOut=1");
  }

  return (
    <ReadOnlyProvider readOnly={readOnly}>
      <div className="flex min-h-dvh flex-col bg-background">
        <header className="sticky top-0 z-20 border-b border-border bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <p className="font-display text-base font-semibold text-foreground">
              {schoolName ?? tenant.data?.branding?.name ?? "SchoolHub"}
            </p>
            <div className="flex items-center gap-2">
              {me.data ? (
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {t("signedInAs", { name: me.data.displayName })}
                </span>
              ) : null}
              <Button variant="ghost" onClick={onSignOut}>
                {t("signOut")}
              </Button>
            </div>
          </div>
        </header>
        <nav
          aria-label={t("menu")}
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:bg-transparent"
        >
          <ul className="mx-auto flex max-w-5xl justify-around gap-1 px-2 md:justify-start md:px-4">
            {nav.map((item) => {
              const current = pathname === item.href;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center px-3 text-sm font-semibold ${current ? "text-brand underline underline-offset-8" : "text-foreground"}`}
                  >
                    {t(`nav.${item.id}`)}
                  </Link>
                </li>
              );
            })}
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

        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 md:pb-10">
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
    </ReadOnlyProvider>
  );
}
