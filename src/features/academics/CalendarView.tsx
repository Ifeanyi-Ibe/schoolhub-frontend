"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { SkeletonList } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/unwrap";
import { AcademicsTabs } from "./AcademicsTabs";
import { useAcademicsAccess } from "./access";
import { calendarDaysQuery, importHolidays, type CalendarDay } from "./catalogue-api";
import { CALENDAR_DAY_TYPES, isIsoDate } from "./catalogue-rules";
import { formatCalendarDate } from "./calendar-format";

const AddCalendarDay = lazy(() =>
  import("./CalendarDialogs").then((m) => ({ default: m.AddCalendarDayDialog })),
);
const ConfirmDeleteDay = lazy(() =>
  import("./CalendarDialogs").then((m) => ({ default: m.ConfirmDeleteDayDialog })),
);

export function CalendarView() {
  const t = useTranslations("academics.calendar");
  const tState = useTranslations("academics.state");
  const tType = useTranslations("academics.calendar.types");
  const access = useAcademicsAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const thisYear = new Date().getUTCFullYear();
  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to, setTo] = useState(`${thisYear}-12-31`);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<CalendarDay | null>(null);
  const [year, setYear] = useState(String(thisYear));
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const rangeValid = isIsoDate(from) && isIsoDate(to) && from <= to;
  const days = useQuery({
    ...calendarDaysQuery(from, to),
    enabled: access.canRead && rangeValid,
  });

  if (access.loading) return <SkeletonList rows={4} label={tState("loading")} />;
  if (access.failed)
    return (
      <ErrorState
        title={tState("errorTitle")}
        description={tState("errorBody")}
        onRetry={() => void qc.invalidateQueries()}
      />
    );
  if (!access.canRead)
    return <EmptyState title={tState("noAccessTitle")} description={tState("noAccessBody")} />;

  const columns: Column<CalendarDay>[] = [
    { key: "date", header: t("columns.date"), cell: (d) => formatCalendarDate(d.date) },
    {
      key: "type",
      header: t("columns.type"),
      cell: (d) => (isKnownType(d.type) ? tType(d.type) : d.type),
    },
    { key: "name", header: t("columns.name"), cell: (d) => d.name },
    {
      key: "actions",
      header: "",
      cell: (d) =>
        access.writable ? (
          <Button
            variant="ghost"
            onClick={() => setDeleting(d)}
            aria-label={`${t("delete")}: ${d.name}`}
          >
            {t("delete")}
          </Button>
        ) : null,
    },
  ];

  async function runImport() {
    setImporting(true);
    setImportMessage(null);
    setImportError(null);
    try {
      const result = await importHolidays(Number(year));
      setImportMessage(t("importDone", { added: result.added, skipped: result.skipped }));
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["calendar-days"] });
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      setImportError(
        problem?.status === 403
          ? tState("forbidden")
          : tState("refused", { code: problem?.code ?? "unknown" }),
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("intro")}
        actions={
          access.writable ? <Button onClick={() => setAdding(true)}>{t("add")}</Button> : null
        }
      />
      <AcademicsTabs />
      {access.readOnlyNotice ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {tState("readOnlyHint")}
        </p>
      ) : null}

      <Card>
        <div className="grid gap-4 sm:grid-cols-2 sm:max-w-xl">
          <Input
            label={t("from")}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input label={t("to")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {!rangeValid ? (
          <p role="alert" className="mt-3 text-sm text-danger-foreground">
            {tState("errorBody")}
          </p>
        ) : null}
      </Card>

      {!rangeValid ? null : days.isPending ? (
        <SkeletonList rows={4} label={tState("loading")} />
      ) : days.isError ? (
        <ErrorState
          title={tState("errorTitle")}
          description={tState("errorBody")}
          problem={days.error instanceof ApiError ? days.error.problem : null}
          onRetry={() => void days.refetch()}
        />
      ) : days.data.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card className="p-0">
          <ResponsiveTable
            caption={t("title")}
            columns={columns}
            rows={days.data}
            rowKey={(d) => d.id}
          />
        </Card>
      )}

      {access.writable ? (
        <Card>
          <CardTitle>{t("importTitle")}</CardTitle>
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void runImport();
            }}
          >
            <div className="w-40">
              <Input
                label={t("importYear")}
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                error={/^\d{4}$/.test(year.trim()) ? undefined : tState("errorBody")}
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              loading={importing}
              loadingLabel={tState("loading")}
              disabled={!/^\d{4}$/.test(year.trim())}
            >
              {t("import")}
            </Button>
          </form>
          {importMessage ? (
            <p role="status" className="mt-3 text-sm text-success-foreground">
              {importMessage}
            </p>
          ) : null}
          {importError ? (
            <p role="alert" className="mt-3 text-sm text-danger-foreground">
              {importError}
            </p>
          ) : null}
        </Card>
      ) : null}

      <Suspense fallback={null}>
        {adding ? <AddCalendarDay onOpenChange={(open) => !open && setAdding(false)} /> : null}
        {deleting !== null ? (
          <ConfirmDeleteDay
            day={deleting}
            onOpenChange={(open) => {
              if (!open) setDeleting(null);
            }}
          />
        ) : null}
      </Suspense>
    </div>
  );
}

function isKnownType(type: string): type is (typeof CALENDAR_DAY_TYPES)[number] {
  return (CALENDAR_DAY_TYPES as readonly string[]).includes(type);
}
