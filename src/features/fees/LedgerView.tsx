"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { SkeletonList } from "@/components/ui/skeleton";
import { formatInstant } from "@/lib/format/dates";
import { formatNaira } from "@/lib/format/money";
import { ApiError } from "@/lib/api/unwrap";
import { useFeeAccess } from "./access";
import { FeesTabs } from "./FeesTabs";
import { studentLedgerQuery, type LedgerView as LedgerData } from "./api";

type LedgerLine = LedgerData["lines"][number];

/** One student's ledger: every debit and credit, with the balance after each. The balance is the server's. */
export function LedgerView() {
  const t = useTranslations("fees");
  const tState = useTranslations("academics.state");
  const access = useFeeAccess();
  const params = useSearchParams();
  const studentId = params.get("studentId") ?? "";
  const [draft, setDraft] = useState(studentId);
  const ledger = useQuery({
    ...studentLedgerQuery(studentId),
    enabled: access.canReports && studentId !== "",
  });

  if (access.loading) return <SkeletonList rows={3} label={tState("loading")} />;
  if (!access.canReports)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  const columns: Column<LedgerLine>[] = [
    { key: "when", header: t("ledger.when"), cell: (l) => formatInstant(l.occurredAt) },
    { key: "type", header: t("ledger.type"), cell: (l) => l.entryType },
    { key: "description", header: t("ledger.description"), cell: (l) => l.description },
    { key: "debit", header: t("ledger.debit"), cell: (l) => formatNaira(Number(l.debitKobo)) },
    { key: "credit", header: t("ledger.credit"), cell: (l) => formatNaira(Number(l.creditKobo)) },
    {
      key: "balance",
      header: t("ledger.balance"),
      cell: (l) => formatNaira(Number(l.balanceAfterKobo)),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("ledger.title")} description={t("ledger.intro")} />
      <FeesTabs />
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Input
            label={t("ledger.student")}
            value={draft}
            onChange={(e) => setDraft(e.target.value.trim())}
            hint={t("ledger.studentHint")}
          />
        </div>
        <Link
          href={`/fees/ledger?studentId=${encodeURIComponent(draft)}`}
          aria-disabled={draft === ""}
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-brand px-4 text-sm font-semibold text-on-brand shadow-brand hover:bg-brand/90"
        >
          {t("ledger.open")}
        </Link>
      </Card>

      {studentId === "" ? (
        <EmptyState title={t("ledger.chooseTitle")} description={t("ledger.chooseBody")} />
      ) : ledger.isPending ? (
        <SkeletonList rows={4} label={tState("loading")} />
      ) : ledger.isError ? (
        <ErrorState
          title={tState("errorTitle")}
          description={tState("errorBody")}
          problem={ledger.error instanceof ApiError ? ledger.error.problem : null}
          onRetry={() => void ledger.refetch()}
        />
      ) : (
        <>
          <Card className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("ledger.balance")}</p>
            <p className="font-display text-2xl font-semibold tabular-nums">
              {formatNaira(Number(ledger.data.balanceKobo))}
            </p>
          </Card>
          {ledger.data.lines.length === 0 ? (
            <EmptyState title={t("ledger.emptyTitle")} description={t("ledger.emptyBody")} />
          ) : (
            <ResponsiveTable
              caption={t("ledger.title")}
              columns={columns}
              rows={ledger.data.lines}
              rowKey={(l) => `${l.occurredAt}-${l.entryType}-${l.description}`}
            />
          )}
          <div>
            <Button variant="ghost" onClick={() => setDraft("")}>
              {t("ledger.clear")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
