"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonList } from "@/components/ui/skeleton";
import { meQuery } from "@/features/shell/api";
import { holdsAny } from "@/features/staff/rules";
import { formatInstant } from "@/lib/format/dates";
import { formatNaira } from "@/lib/format/money";
import { adminDashboardQuery, currentTermQuery } from "./api";
import { countText, notIncludedList, percentText } from "./rules";

export const DASHBOARD_PERMISSION = "dashboard.read";

/** Money from the server is integer kobo. A value that cannot be shown exactly is a dash, never a rounded figure. */
function naira(kobo: number | string | null | undefined): string {
  const n = Number(kobo);
  if (kobo === null || kobo === undefined || !Number.isSafeInteger(n)) return "—";
  return formatNaira(n);
}

/** The school's dashboard for the current term, as the server computes it (ADR 0025, slice 4). */
export function AdminDashboardView() {
  const t = useTranslations("dashboard");
  const tState = useTranslations("dashboard.state");
  const me = useQuery(meQuery);
  const allowed = me.data !== undefined && holdsAny(me.data.permissions, [DASHBOARD_PERMISSION]);
  const term = useQuery({ ...currentTermQuery(), enabled: allowed });
  const termId = term.data ?? "";
  const board = useQuery({ ...adminDashboardQuery(termId), enabled: allowed && termId !== "" });

  if (me.data !== undefined && !allowed)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;
  if (term.isError || board.isError)
    return <ErrorState title={t("loadError")} onRetry={() => void board.refetch()} />;
  if (term.data === null)
    return <EmptyState title={t("noTerm.title")} description={t("noTerm.body")} />;

  const d = board.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={d ? t("generated", { when: formatInstant(d.generatedAt) }) : t("intro")}
      />
      {!d ? <SkeletonList rows={4} label={tState("loading")} /> : null}
      {d ? (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">{t("enrolment.title")}</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("enrolment.active")}</dt>
                <dd className="tabular-nums font-semibold">{countText(d.enrolment.active)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("enrolment.suspended")}</dt>
                <dd className="tabular-nums">{countText(d.enrolment.suspended)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("enrolment.withdrawn")}</dt>
                <dd className="tabular-nums">{countText(d.enrolment.withdrawn)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("enrolment.graduated")}</dt>
                <dd className="tabular-nums">{countText(d.enrolment.graduated)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("enrolment.female")}</dt>
                <dd className="tabular-nums">{countText(d.enrolment.activeFemale)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("enrolment.male")}</dt>
                <dd className="tabular-nums">{countText(d.enrolment.activeMale)}</dd>
              </div>
            </dl>
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">{t("fees.title")}</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("fees.billed")}</dt>
                <dd className="tabular-nums">{naira(d.fees.billedKobo)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("fees.collected")}</dt>
                <dd className="tabular-nums">{naira(d.fees.collectedKobo)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("fees.outstanding")}</dt>
                <dd className="tabular-nums font-semibold">{naira(d.fees.outstandingKobo)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("fees.collectedPercent")}</dt>
                <dd className="tabular-nums">{percentText(d.fees.collectedPercent)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("fees.debtors")}</dt>
                <dd className="tabular-nums">{countText(d.fees.debtorCount)}</dd>
              </div>
            </dl>
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">{t("results.title")}</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("results.sheets")}</dt>
                <dd className="tabular-nums">{countText(d.results.sheetsTotal)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("results.approved")}</dt>
                <dd className="tabular-nums">{countText(d.results.sheetsApproved)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("results.published")}</dt>
                <dd className="tabular-nums">{countText(d.results.armsPublished)}</dd>
              </div>
            </dl>
          </Card>
          {notIncludedList(d.notIncluded).length > 0 ? (
            <Card className="flex flex-col gap-2 md:col-span-3">
              <h2 className="text-base font-semibold text-foreground">{t("notIncluded.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {notIncludedList(d.notIncluded).join(", ")}
              </p>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
