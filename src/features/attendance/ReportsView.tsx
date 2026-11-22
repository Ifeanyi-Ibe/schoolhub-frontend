"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { academicSessionsQuery, sessionTermsQuery } from "@/features/academics/sessions-api";
import { downloadQueryFromApi } from "@/features/files/download";
import { useArmOptions } from "@/features/students/arms";
import { lagosToday } from "@/features/staff-members/rules";
import { myAssignmentsQuery } from "@/features/staff-members/api";
import { ApiError } from "@/lib/api/unwrap";
import { useAttendanceAccess } from "./access";
import {
  absenteesQuery,
  classSummaryQuery,
  termSummaryQuery,
  termSummaryXlsxPath,
  type AbsenteeRow,
} from "./api";

type Section = "absentees" | "classSummary" | "termSummary";
const SECTIONS: Section[] = ["absentees", "classSummary", "termSummary"];

/** Reports for the teacher's own classes: who was absent on a day, a class over a range, and a term's totals. */
export function ReportsView() {
  const t = useTranslations("attendance");
  const tState = useTranslations("academics.state");
  const access = useAttendanceAccess();
  const sessions = useQuery({ ...academicSessionsQuery, enabled: access.canReadMark });
  const sessionId = sessions.data?.find((s) => s.isCurrent)?.id ?? sessions.data?.[0]?.id ?? "";
  const mine = useQuery({
    ...myAssignmentsQuery(sessionId),
    enabled: access.canReadMark && sessionId !== "",
  });
  const terms = useQuery({
    ...sessionTermsQuery(sessionId),
    enabled: access.canReadMark && sessionId !== "",
  });
  const arms = useArmOptions(access.canReadMark);
  const classArmIds = [...new Set((mine.data?.assignments ?? []).map((a) => a.classArmId))];
  const [section, setSection] = useState<Section>("absentees");
  const [classArmId, setClassArmId] = useState("");
  const arm = classArmId !== "" ? classArmId : (classArmIds[0] ?? "");
  const [day, setDay] = useState(lagosToday());
  const [from, setFrom] = useState(lagosToday());
  const [to, setTo] = useState(lagosToday());
  const [termId, setTermId] = useState("");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const term = termId !== "" ? termId : (terms.data?.[0]?.id ?? "");

  const absentees = useQuery({
    ...absenteesQuery(arm, day, null),
    enabled: access.canReadMark && arm !== "" && section === "absentees",
  });
  const classSummary = useQuery({
    ...classSummaryQuery(arm, from, to),
    enabled: access.canReadMark && arm !== "" && section === "classSummary" && from <= to,
  });
  const termSummary = useQuery({
    ...termSummaryQuery(arm, term),
    enabled: access.canReadMark && arm !== "" && term !== "" && section === "termSummary",
  });

  if (access.loading) return <SkeletonList rows={3} label={tState("loading")} />;
  if (!access.canReadMark)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;
  if (!mine.isPending && classArmIds.length === 0)
    return <EmptyState title={t("home.noClassesTitle")} description={t("home.noClassesBody")} />;

  const labelOf = (id: string) => arms.find((a) => a.id === id)?.label ?? t("home.armFallback");

  const absenteeColumns: Column<AbsenteeRow>[] = [
    { key: "name", header: t("reports.name"), cell: (r) => r.fullName },
    { key: "admission", header: t("reports.admission"), cell: (r) => r.admissionNo },
    { key: "period", header: t("reports.period"), cell: (r) => r.period ?? t("reports.daily") },
    { key: "note", header: t("reports.note"), cell: (r) => r.note ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("reports.title")} description={t("reports.intro")} />

      <Card className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("reports.class")}
            value={arm}
            onChange={(e) => setClassArmId(e.target.value)}
          >
            {classArmIds.map((id) => (
              <option key={id} value={id}>
                {labelOf(id)}
              </option>
            ))}
          </Select>
          <div
            role="group"
            aria-label={t("reports.section")}
            className="flex flex-wrap gap-2 self-end"
          >
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={section === s}
                onClick={() => setSection(s)}
                className={`min-h-11 rounded-control border px-4 text-sm font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${section === s ? "border-brand bg-brand text-on-brand" : "border-border bg-surface text-foreground hover:bg-muted"}`}
              >
                {t(`reports.sections.${s}`)}
              </button>
            ))}
          </div>
        </div>

        {section === "absentees" ? (
          <Input
            label={t("reports.day")}
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        ) : null}
        {section === "classSummary" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t("reports.from")}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              label={t("reports.to")}
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              error={from > to ? t("reports.rangeOrder") : undefined}
            />
          </div>
        ) : null}
        {section === "termSummary" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="sm:w-72">
              <Select
                label={t("reports.term")}
                value={term}
                onChange={(e) => setTermId(e.target.value)}
              >
                {(terms.data ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </div>
            {access.canExport && term !== "" ? (
              <Button
                variant="secondary"
                onClick={async () => {
                  setExportMessage(null);
                  try {
                    await downloadQueryFromApi(
                      termSummaryXlsxPath(arm, term),
                      `attendance-${arm}-${term}.xlsx`,
                    );
                  } catch {
                    setExportMessage(t("reports.exportFailed"));
                  }
                }}
              >
                {t("reports.export")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {exportMessage ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {exportMessage}
          </p>
        ) : null}
      </Card>

      {section === "absentees" ? (
        absentees.isPending ? (
          <SkeletonList rows={3} label={tState("loading")} />
        ) : absentees.isError ? (
          <ErrorState
            title={tState("errorTitle")}
            description={tState("errorBody")}
            problem={absentees.error instanceof ApiError ? absentees.error.problem : null}
            onRetry={() => void absentees.refetch()}
          />
        ) : absentees.data.length === 0 ? (
          <EmptyState
            title={t("reports.noAbsenteesTitle")}
            description={t("reports.noAbsenteesBody")}
          />
        ) : (
          <ResponsiveTable
            caption={t("reports.sections.absentees")}
            columns={absenteeColumns}
            rows={absentees.data}
            rowKey={(r) => r.studentId}
          />
        )
      ) : null}

      {section === "classSummary" && from <= to ? (
        classSummary.isPending ? (
          <SkeletonList rows={3} label={tState("loading")} />
        ) : classSummary.isError ? (
          <ErrorState
            title={tState("errorTitle")}
            description={tState("errorBody")}
            onRetry={() => void classSummary.refetch()}
          />
        ) : (
          <Card className="flex flex-col gap-4">
            <CardTitle>{t("reports.sections.classSummary")}</CardTitle>
            <ResponsiveTable
              caption={t("reports.sections.classSummary")}
              columns={[
                { key: "date", header: t("reports.date"), cell: (d) => d.date },
                { key: "present", header: t("status.Present"), cell: (d) => Number(d.present) },
                { key: "absent", header: t("status.Absent"), cell: (d) => Number(d.absent) },
                { key: "late", header: t("status.Late"), cell: (d) => Number(d.late) },
                { key: "excused", header: t("status.Excused"), cell: (d) => Number(d.excused) },
                { key: "unmarked", header: t("reports.unmarked"), cell: (d) => Number(d.unmarked) },
              ]}
              rows={classSummary.data.days}
              rowKey={(d) => d.date}
            />
          </Card>
        )
      ) : null}

      {section === "termSummary" && term !== "" ? (
        termSummary.isPending ? (
          <SkeletonList rows={3} label={tState("loading")} />
        ) : termSummary.isError ? (
          <ErrorState
            title={tState("errorTitle")}
            description={tState("errorBody")}
            onRetry={() => void termSummary.refetch()}
          />
        ) : (
          <ResponsiveTable
            caption={t("reports.sections.termSummary")}
            columns={[
              { key: "name", header: t("reports.name"), cell: (s) => s.fullName },
              {
                key: "present",
                header: t("status.Present"),
                cell: (s) => Number(s.summary.present),
              },
              { key: "absent", header: t("status.Absent"), cell: (s) => Number(s.summary.absent) },
              { key: "late", header: t("status.Late"), cell: (s) => Number(s.summary.late) },
              {
                key: "excused",
                header: t("status.Excused"),
                cell: (s) => Number(s.summary.excused),
              },
              {
                key: "rate",
                header: t("reports.rate"),
                cell: (s) =>
                  s.summary.rate === null ? "—" : `${Math.round(Number(s.summary.rate))}%`,
              },
            ]}
            rows={termSummary.data.students}
            rowKey={(s) => s.studentId}
          />
        )
      ) : null}
    </div>
  );
}
