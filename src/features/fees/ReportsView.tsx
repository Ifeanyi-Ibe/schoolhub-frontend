"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { SkeletonList } from "@/components/ui/skeleton";
import { formatNaira } from "@/lib/format/money";
import { ApiError } from "@/lib/api/unwrap";
import { lagosToday } from "@/features/staff-members/rules";
import { useFeeAccess } from "./access";
import { FeesTabs } from "./FeesTabs";
import { collectionQuery, debtorsQuery, reconciliationQuery } from "./api";

/** Collection, debtors and reconciliation, as the server computes them. The screen shows the totals it is given. */
export function FeesReportsView() {
  const t = useTranslations("fees");
  const tState = useTranslations("academics.state");
  const access = useFeeAccess();
  const monthStart = lagosToday().slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(lagosToday());
  const collection = useQuery({
    ...collectionQuery(from, to),
    enabled: access.canReports && from <= to,
  });
  const debtors = useQuery({ ...debtorsQuery(), enabled: access.canReports });
  const reconciliation = useQuery({ ...reconciliationQuery(), enabled: access.canReports });

  if (access.loading) return <SkeletonList rows={3} label={tState("loading")} />;
  if (!access.canReports)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  const error = (err: unknown, retry: () => void) => (
    <ErrorState
      title={tState("errorTitle")}
      description={tState("errorBody")}
      problem={err instanceof ApiError ? err.problem : null}
      onRetry={retry}
    />
  );

  const methodColumns: Column<{ method: string; amountKobo: number; count: number | string }>[] = [
    { key: "method", header: t("reports.method"), cell: (r) => r.method },
    { key: "count", header: t("reports.count"), cell: (r) => Number(r.count) },
    { key: "amount", header: t("reports.amount"), cell: (r) => formatNaira(r.amountKobo) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("reports.title")} description={t("reports.intro")} />
      <FeesTabs />

      <Card className="flex flex-col gap-5">
        <CardTitle>{t("reports.collection")}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t("reports.from")}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            error={from > to ? t("reports.rangeOrder") : undefined}
          />
          <Input
            label={t("reports.to")}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        {collection.isPending && from <= to ? (
          <SkeletonList rows={2} label={tState("loading")} />
        ) : collection.isError ? (
          error(collection.error, () => void collection.refetch())
        ) : collection.data ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure label={t("reports.total")} value={formatNaira(collection.data.totalKobo)} />
              <Figure
                label={t("reports.credits")}
                value={formatNaira(collection.data.ledgerCreditsKobo)}
              />
              <Figure
                label={t("reports.reversals")}
                value={formatNaira(collection.data.ledgerReversalsKobo)}
              />
            </dl>
            <ResponsiveTable
              caption={t("reports.byMethod")}
              columns={methodColumns}
              rows={collection.data.byMethod}
              rowKey={(r) => r.method}
            />
          </>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-5">
        <CardTitle>{t("reports.debtors")}</CardTitle>
        {debtors.isPending ? (
          <SkeletonList rows={2} label={tState("loading")} />
        ) : debtors.isError ? (
          error(debtors.error, () => void debtors.refetch())
        ) : debtors.data ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure
                label={t("reports.outstanding")}
                value={formatNaira(debtors.data.totalOutstandingKobo)}
              />
            </dl>
            <ResponsiveTable
              caption={t("reports.aging")}
              columns={[
                { key: "bucket", header: t("reports.bucket"), cell: (b) => b.bucket },
                { key: "invoices", header: t("reports.invoices"), cell: (b) => Number(b.invoices) },
                {
                  key: "outstanding",
                  header: t("reports.outstanding"),
                  cell: (b) => formatNaira(b.outstandingKobo),
                },
              ]}
              rows={debtors.data.buckets}
              rowKey={(b) => b.bucket}
            />
            <ResponsiveTable
              caption={t("reports.debtorList")}
              columns={[
                {
                  key: "student",
                  header: t("reports.student"),
                  cell: (d) => (
                    <Link
                      href={`/fees/ledger?studentId=${encodeURIComponent(d.studentId)}`}
                      className="font-semibold text-brand underline underline-offset-4"
                    >
                      {t("reports.openLedger")}
                    </Link>
                  ),
                },
                {
                  key: "outstanding",
                  header: t("reports.outstanding"),
                  cell: (d) => formatNaira(d.outstandingKobo),
                },
              ]}
              rows={debtors.data.debtors}
              rowKey={(d) => d.studentId}
            />
          </>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-5">
        <CardTitle>{t("reports.reconciliation")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("reports.reconciliationIntro")}</p>
        {reconciliation.isPending ? (
          <SkeletonList rows={2} label={tState("loading")} />
        ) : reconciliation.isError ? (
          error(reconciliation.error, () => void reconciliation.refetch())
        ) : reconciliation.data && reconciliation.data.drift.length === 0 ? (
          <p role="status" className="text-sm text-foreground">
            {t("reports.noDrift", { students: Number(reconciliation.data.students) })}
          </p>
        ) : reconciliation.data ? (
          <ResponsiveTable
            caption={t("reports.reconciliation")}
            columns={[
              { key: "student", header: t("reports.student"), cell: (d) => d.studentId },
              {
                key: "ledger",
                header: t("reports.ledgerNet"),
                cell: (d) => formatNaira(Number(d.ledgerNetKobo)),
              },
              {
                key: "invoice",
                header: t("reports.invoiceSide"),
                cell: (d) => formatNaira(Number(d.invoiceSideKobo)),
              },
              {
                key: "difference",
                header: t("reports.difference"),
                cell: (d) => formatNaira(Number(d.differenceKobo)),
              },
            ]}
            rows={reconciliation.data.drift}
            rowKey={(d) => d.studentId}
          />
        ) : null}
      </Card>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-background px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="font-display text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
