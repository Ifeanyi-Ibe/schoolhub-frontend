"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { useOnline } from "@/components/ui/offline-status";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { refusalText } from "@/features/students/refusal";
import { downloadQueryFromApi } from "@/features/files/download";
import { ApiError } from "@/lib/api/unwrap";
import { useAssessmentAccess } from "./access";
import { armNamesQuery, myAssignmentsOnlyQuery, termsQuery } from "./api";
import {
  classExportPath,
  classResultsQuery,
  computeResults,
  jobQuery,
  saveRatings,
  saveRemark,
  studentResultsQuery,
  traitsQuery,
  type ClassKey,
  type JobView,
  type StudentResultView,
} from "./results/api";
import {
  jobFinished,
  jobProgressPercent,
  ratingProblem,
  remarkProblem,
  RATING_MAX,
  RATING_MIN,
} from "./results/rules";

/**
 * The class broadsheet, its computation, the export, and each student's domains and remarks (ADR 0024, slice 3). The server
 * computes every figure; the screen shows them as it receives them.
 */
export function ResultsView() {
  const t = useTranslations("results");
  const tState = useTranslations("results.state");
  const qc = useQueryClient();
  const access = useAssessmentAccess();
  const online = useOnline();

  const assignments = useQuery(myAssignmentsOnlyQuery());
  const sessionId = assignments.data?.sessionId ?? "";
  const terms = useQuery({ ...termsQuery(sessionId), enabled: sessionId !== "" });
  const arms = useQuery(armNamesQuery());
  const [termChoice, setTermChoice] = useState("");
  const [armChoice, setArmChoice] = useState("");
  const current = terms.data?.find((x) => x.isCurrent) ?? terms.data?.[0];
  const termId = termChoice || current?.id || "";
  // Approvers choose among every class; a teacher among the classes they are assigned to (the server still decides).
  const armOptions: Array<{ id: string; name: string }> = access.canApprove
    ? [...(arms.data?.entries() ?? [])].map(([id, name]) => ({ id, name }))
    : [...new Set((assignments.data?.assignments ?? []).map((a) => a.classArmId))].map((id) => ({
        id,
        name: arms.data?.get(id) ?? "",
      }));
  const classArmId = armOptions.some((o) => o.id === armChoice)
    ? armChoice
    : (armOptions[0]?.id ?? "");
  const key: ClassKey | null = termId && classArmId ? { termId, classArmId } : null;

  const broadsheet = useQuery({
    ...classResultsQuery(key ?? NO_CLASS),
    enabled: key !== null && access.canView,
  });
  const [jobId, setJobId] = useState("");
  const job = useQuery({
    ...jobQuery(jobId),
    enabled: jobId !== "",
    refetchInterval: (q) => (q.state.data && jobFinished(q.state.data) ? false : 2000),
  });
  const [selected, setSelected] = useState("");
  const student = useQuery({
    ...studentResultsQuery(selected, termId),
    enabled: selected !== "" && termId !== "",
  });
  const traits = useQuery(traitsQuery());

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (access.loading) return <SkeletonList rows={4} label={tState("loading")} />;
  if (access.failed) return <ErrorState title={t("loadError")} />;
  if (!access.canView)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  const writesAllowed = online;
  const rows: StudentResultView[] = broadsheet.data ?? [];
  const subjectColumns = rows[0]?.subjects ?? [];
  const jobData: JobView | undefined = job.data;

  async function compute() {
    if (!key) return;
    setBusy("compute");
    setMessage(null);
    try {
      const started = await computeResults(key);
      setJobId(started.id);
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(null);
    }
  }

  async function exportSheet() {
    if (!key) return;
    setBusy("export");
    setMessage(null);
    try {
      await downloadQueryFromApi(classExportPath(key), t("export.fileName"));
    } catch {
      setMessage(t("export.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      <nav aria-label={t("related.label")} className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/report-cards" className="text-brand underline underline-offset-4">
          {t("related.reportCards")}
        </Link>
        <Link href="/amendments" className="text-brand underline underline-offset-4">
          {t("related.amendments")}
        </Link>
        <Link href="/inbox" className="text-brand underline underline-offset-4">
          {t("related.inbox")}
        </Link>
        <Link href="/announcements" className="text-brand underline underline-offset-4">
          {t("related.announcements")}
        </Link>
        <Link href="/notifications" className="text-brand underline underline-offset-4">
          {t("related.notifications")}
        </Link>
      </nav>
      {!online ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {t("offline")}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("pick.class")}
            value={classArmId}
            onChange={(e) => setArmChoice(e.target.value)}
          >
            {armOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          <Select
            label={t("pick.term")}
            value={termId}
            onChange={(e) => setTermChoice(e.target.value)}
          >
            {(terms.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {access.canApprove ? (
            <Button
              variant="secondary"
              onClick={compute}
              disabled={
                !key ||
                !writesAllowed ||
                busy !== null ||
                (jobData !== undefined && !jobFinished(jobData))
              }
              loading={busy === "compute"}
              loadingLabel={t("compute.starting")}
            >
              {t("compute.action")}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={exportSheet}
            disabled={!key || rows.length === 0 || busy !== null}
            loading={busy === "export"}
            loadingLabel={t("export.working")}
          >
            {t("export.action")}
          </Button>
        </div>
        {jobData ? (
          <div role="status" className="flex flex-col gap-2 text-sm">
            <p className="text-foreground">{t("compute.status", { status: jobData.status })}</p>
            <div className="h-2 w-full rounded-full bg-background" aria-hidden="true">
              <div
                className="h-2 rounded-full bg-brand"
                style={{ width: `${jobProgressPercent(jobData)}%` }}
              />
            </div>
            <p className="text-muted-foreground">
              {t("compute.progress", { done: String(jobData.done), total: String(jobData.total) })}
            </p>
            {jobData.error ? (
              <p className="text-danger-foreground">
                {t("compute.failed", { error: jobData.error })}
              </p>
            ) : null}
            {jobFinished(jobData) && !jobData.error ? (
              <p className="text-foreground">{t("compute.done")}</p>
            ) : null}
          </div>
        ) : null}
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </Card>

      {key && broadsheet.isPending ? <SkeletonList rows={4} label={tState("loading")} /> : null}
      {key && broadsheet.isError ? (
        <ErrorState title={t("loadError")} onRetry={() => void broadsheet.refetch()} />
      ) : null}
      {key && broadsheet.data && rows.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.body")} />
      ) : null}

      {rows.length > 0 ? (
        <section aria-labelledby="broadsheet-title" className="flex flex-col gap-3">
          <h2 id="broadsheet-title" className="text-lg font-semibold text-foreground">
            {t("broadsheet.title")}
          </h2>
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-background text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t("broadsheet.student")}
                  </th>
                  {subjectColumns.map((s) => (
                    <th key={s.subjectId} scope="col" className="px-3 py-2 font-semibold">
                      {s.subjectName}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t("broadsheet.termTotal")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t("broadsheet.average")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t("broadsheet.position")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      <button
                        type="button"
                        className="text-left text-brand underline underline-offset-4"
                        onClick={() => setSelected(r.studentId)}
                        aria-pressed={selected === r.studentId}
                      >
                        {r.studentName}
                      </button>
                      <span className="block text-xs text-muted-foreground">{r.admissionNo}</span>
                    </th>
                    {r.subjects.map((s) => (
                      <td key={s.subjectId} className="px-3 py-2 tabular-nums">
                        {s.isAbsent ? t("broadsheet.absent") : (s.total ?? "—")}
                        {s.grade ? (
                          <span className="block text-xs text-muted-foreground">{s.grade}</span>
                        ) : null}
                      </td>
                    ))}
                    <td className="px-3 py-2 tabular-nums">{r.termTotal ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{r.termAverage ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{r.position ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selected !== "" && student.data ? (
        <StudentPanel
          key={`${selected}-${termId}`}
          result={student.data}
          termId={termId}
          traits={traits.data ?? []}
          canApprove={access.canApprove}
          writesAllowed={writesAllowed}
          onSaved={() =>
            void qc.invalidateQueries({ queryKey: studentResultsQuery(selected, termId).queryKey })
          }
        />
      ) : null}
      {selected !== "" && student.isError ? (
        <ErrorState title={t("loadError")} onRetry={() => void student.refetch()} />
      ) : null}
    </div>
  );
}

const NO_CLASS: ClassKey = { termId: "", classArmId: "" };

/** A student's subjects, domains and remarks for the term. Ratings and remarks are saved as the server answers. */
function StudentPanel({
  result,
  termId,
  traits,
  canApprove,
  writesAllowed,
  onSaved,
}: {
  result: StudentResultView;
  termId: string;
  traits: Array<{ id: string; kind: string; name: string }>;
  canApprove: boolean;
  writesAllowed: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("results");
  const tState = useTranslations("results.state");
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [teacherRemark, setTeacherRemark] = useState("");
  const [principalRemark, setPrincipalRemark] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const problems = traits
    .map((tr) => ratingProblem(ratings[tr.id] ?? ""))
    .filter((p) => p !== null);

  async function saveDomains() {
    setTried(true);
    if (problems.length > 0) return;
    const entries = traits
      .filter((tr) => (ratings[tr.id] ?? "").trim() !== "")
      .map((tr) => ({ traitId: tr.id, rating: Number((ratings[tr.id] ?? "").trim()) }));
    if (entries.length === 0) return;
    setBusy("ratings");
    setNote(null);
    try {
      await saveRatings(result.studentId, termId, entries);
      setNote(t("domains.saved"));
      onSaved();
    } catch (err) {
      setNote(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function saveTeacher() {
    setBusy("teacher");
    setNote(null);
    try {
      await saveRemark("teacher", result.studentId, termId, teacherRemark.trim() || null);
      setNote(t("remarks.saved"));
      onSaved();
    } catch (err) {
      setNote(refusalText(err, tState));
    } finally {
      setBusy(null);
    }
  }

  async function savePrincipal() {
    setBusy("principal");
    setNote(null);
    try {
      await saveRemark("principal", result.studentId, termId, principalRemark.trim() || null);
      setNote(t("remarks.saved"));
      onSaved();
    } catch (err) {
      setNote(refusalText(err, tState));
    } finally {
      setBusy(null);
    }
  }

  const teacherProblem = remarkProblem(teacherRemark);
  const principalProblem = remarkProblem(principalRemark);

  return (
    <section aria-labelledby="student-title" className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h3 id="student-title" className="text-base font-semibold text-foreground">
          {result.studentName}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("student.summary", {
            total: result.termTotal ?? "—",
            average: result.termAverage ?? "—",
            position: result.position ?? "—",
            outOf: String(result.outOf),
          })}
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {result.subjects.map((s) => (
            <li
              key={s.subjectId}
              className="flex flex-wrap justify-between gap-2 border-t border-border pt-2"
            >
              <span className="font-medium">{s.subjectName}</span>
              <span className="tabular-nums">
                {s.isAbsent ? t("broadsheet.absent") : (s.total ?? "—")}
                {s.grade ? ` · ${s.grade}` : ""}
                {s.remark ? ` · ${s.remark}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>{t("domains.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("domains.intro", { min: String(RATING_MIN), max: String(RATING_MAX) })}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {traits.map((tr) => (
            <Input
              key={tr.id}
              label={`${tr.name} (${tr.kind})`}
              inputMode="numeric"
              value={ratings[tr.id] ?? ""}
              onChange={(e) => setRatings({ ...ratings, [tr.id]: e.target.value })}
              error={
                tried && ratingProblem(ratings[tr.id] ?? "")
                  ? t(`rating.${ratingProblem(ratings[tr.id] ?? "")}`, {
                      min: String(RATING_MIN),
                      max: String(RATING_MAX),
                    })
                  : undefined
              }
            />
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            onClick={saveDomains}
            disabled={!writesAllowed || busy !== null || traits.length === 0}
            loading={busy === "ratings"}
            loadingLabel={t("saving")}
          >
            {t("domains.save")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>{t("remarks.title")}</CardTitle>
        <Input
          label={t("remarks.teacher")}
          value={teacherRemark}
          onChange={(e) => setTeacherRemark(e.target.value)}
          error={teacherProblem ? t("remarks.tooLong", { max: String(500) }) : undefined}
        />
        <div className="flex justify-end">
          <Button
            onClick={saveTeacher}
            disabled={!writesAllowed || busy !== null || teacherProblem !== null}
            loading={busy === "teacher"}
            loadingLabel={t("saving")}
          >
            {t("remarks.saveTeacher")}
          </Button>
        </div>
        {canApprove ? (
          <>
            <Input
              label={t("remarks.principal")}
              value={principalRemark}
              onChange={(e) => setPrincipalRemark(e.target.value)}
              error={principalProblem ? t("remarks.tooLong", { max: String(500) }) : undefined}
            />
            <div className="flex justify-end">
              <Button
                onClick={savePrincipal}
                disabled={!writesAllowed || busy !== null || principalProblem !== null}
                loading={busy === "principal"}
                loadingLabel={t("saving")}
              >
                {t("remarks.savePrincipal")}
              </Button>
            </div>
          </>
        ) : null}
      </Card>

      {note ? (
        <p role="status" className="text-sm text-foreground">
          {note}
        </p>
      ) : null}
    </section>
  );
}
