"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useLightTranslations } from "@/i18n/light-provider";
import { meQuery } from "@/features/shell/api";
import { holdsAny } from "@/features/staff/rules";
import { wardsQuery } from "./api";

/** The wards linked to this account. A parent with one child sees one card. */
export function WardsListView() {
  const t = useLightTranslations("wards");
  const me = useQuery(meQuery);
  const allowed = me.data !== undefined && holdsAny(me.data.permissions, ["me.wards"]);
  const wards = useQuery({ ...wardsQuery(), enabled: allowed });

  if (me.data !== undefined && !allowed)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      {wards.isError ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {t("loadError")}
        </p>
      ) : wards.data && wards.data.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(wards.data ?? []).map((w) => (
            <li key={w.studentId}>
              <Link
                href={`/wards/${encodeURIComponent(w.studentId)}`}
                className="group flex min-h-16 items-center gap-4 rounded-card border border-border/80 bg-surface p-4 shadow-card hover:border-brand/40"
              >
                <Avatar name={w.fullName} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground group-hover:text-brand">
                    {w.fullName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("relationship", { relationship: w.relationship })}
                  </p>
                </div>
                <span className="text-sm font-semibold text-brand">{t("open")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
