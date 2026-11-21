"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ChevronRightIcon } from "@/components/ui/icons";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useLightTranslations } from "@/i18n/light-provider";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { NAV_ITEMS, visibleNav } from "@/features/shell/nav";

const STATUS_TONE: Record<string, StatusTone> = {
  Active: "success",
  Trial: "info",
  PastDue: "warning",
  Suspended: "danger",
  Cancelled: "neutral",
};
const STATUS_KEY: Record<string, string> = {
  Active: "active",
  Trial: "trial",
  PastDue: "pastDue",
  Suspended: "suspended",
  Cancelled: "cancelled",
};

/**
 * The first screen after sign-in: a greeting, the school's status and plan, the user's roles, and links to
 * the screens the user's permissions allow. Nothing here decides access; it only lists what GET /me allows.
 */
export function HomeView() {
  const t = useLightTranslations("home");
  const tNav = useLightTranslations("shell.nav");
  const me = useQuery(meQuery);
  const tenant = useQuery(tenantQuery);

  if (!me.data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <div className="h-36 animate-pulse rounded-card bg-muted" aria-hidden="true" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="h-24 animate-pulse rounded-card bg-muted" aria-hidden="true" />
          <div className="h-24 animate-pulse rounded-card bg-muted" aria-hidden="true" />
          <div className="h-24 animate-pulse rounded-card bg-muted" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const status = tenant.data?.status ?? "";
  const actions = visibleNav(NAV_ITEMS, me.data.permissions).filter((item) => item.id !== "home");

  return (
    <div className="flex flex-col gap-8">
      <section className="relative overflow-hidden rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-brand-soft to-transparent opacity-80"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={me.data.displayName} size="lg" className="size-14 text-lg" />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {t("welcome", { name: me.data.displayName })}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("hero")}</p>
          </div>
        </div>
      </section>

      <section aria-label={t("statusLabel")} className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-2 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("statusLabel")}
          </p>
          {tenant.data ? (
            <StatusBadge tone={STATUS_TONE[status] ?? "neutral"}>
              {t(`status.${STATUS_KEY[status] ?? "cancelled"}`)}
            </StatusBadge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </Card>
        <Card className="flex flex-col gap-2 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("planLabel")}
          </p>
          <p className="font-display text-lg font-semibold text-foreground">
            {tenant.data?.planName ?? "—"}
          </p>
        </Card>
        <Card className="flex flex-col gap-2 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("rolesLabel")}
          </p>
          <p className="font-display text-lg font-semibold text-foreground">
            {t("roleCount", { count: me.data.roles.length })}
          </p>
          {me.data.roles.length > 0 ? (
            <ul className="flex flex-wrap gap-2 pt-1">
              {me.data.roles.map((r) => (
                <li key={r}>
                  <StatusBadge tone="neutral">{r}</StatusBadge>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </section>

      <section aria-labelledby="quick-actions" className="flex flex-col gap-3">
        <div>
          <h2 id="quick-actions" className="font-display text-lg font-semibold text-foreground">
            {t("quickActions")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("quickActionsHint")}</p>
        </div>
        {actions.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            {t("noActions")}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {actions.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="group flex min-h-16 items-center gap-4 rounded-card border border-border bg-surface px-5 py-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-raised focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-soft-foreground">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {tNav(item.id)}
                    </span>
                    <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
