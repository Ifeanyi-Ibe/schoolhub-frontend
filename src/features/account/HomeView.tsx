"use client";

import { useQuery } from "@tanstack/react-query";
import { useLightTranslations } from "@/i18n/light-provider";
import { Card, CardTitle } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { meQuery, tenantQuery } from "@/features/shell/api";

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

export function HomeView() {
  const t = useLightTranslations("home");
  const me = useQuery(meQuery);
  const tenant = useQuery(tenantQuery);
  if (!me.data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
        <Card className="h-24 animate-pulse bg-muted" aria-hidden="true" />
      </div>
    );
  }
  const status = tenant.data?.status ?? "";
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        {t("welcome", { name: me.data.displayName })}
      </h1>
      <Card>
        <CardTitle>{t("roles")}</CardTitle>
        {me.data.roles.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noRoles")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {me.data.roles.map((r) => (
              <li key={r}>
                <StatusBadge tone="neutral">{r}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardTitle>{t("school")}</CardTitle>
        {tenant.data ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge tone={STATUS_TONE[status] ?? "neutral"}>
              {t(`status.${STATUS_KEY[status] ?? "cancelled"}`)}
            </StatusBadge>
            <span className="text-muted-foreground">{tenant.data.planName}</span>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
