"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { academicSessionsQuery } from "@/features/academics/sessions-api";
import { downloadFromApi } from "@/features/files/download";
import { uploadFile, UploadRefused } from "@/features/files/upload";
import { newActionKey } from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/unwrap";
import { StudentsTabs } from "./StudentsTabs";
import { useStudentAccess } from "./access";
import {
  commitImport,
  createImportJob,
  importJobQuery,
  importRowsQuery,
  type ImportRowView,
} from "./api";
import { IMPORT_MODES, isImportWorking } from "./rules";

const TEMPLATE_PATH = "/api/v1/students/import/template";

/**
 * Bulk import: download the template, upload the file, watch the background check, read the row report,
 * then commit. The commit is idempotent (one key per user action); nothing is created before the commit.
 */
export function ImportStudentsView() {
  const t = useTranslations("students.import");
  const tPaging = useTranslations("students");
  const tState = useTranslations("academics.state");
  const tRules = useTranslations("students.rules");
  const access = useStudentAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const sessions = useQuery({ ...academicSessionsQuery, enabled: access.canImport });
  const [sessionId, setSessionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<(typeof IMPORT_MODES)[number]>("SkipErrors");
  const [commitKey, setCommitKey] = useState(() => newActionKey());
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [page, setPage] = useState(1);

  const job = useQuery({
    ...importJobQuery(jobId ?? ""),
    enabled: jobId !== null && access.canImport,
    refetchInterval: (q) => (q.state.data && isImportWorking(q.state.data.status) ? 2000 : false),
  });
  const rows = useQuery({
    ...importRowsQuery(jobId ?? "", errorsOnly, page),
    enabled: jobId !== null && job.data !== undefined && !isImportWorking(job.data.status),
  });

  if (access.loading) return <SkeletonList rows={4} label={tState("loading")} />;
  if (!access.canImport)
    return <EmptyState title={tState("noAccessTitle")} description={tState("noAccessBody")} />;

  async function start() {
    const found: string[] = [];
    if (sessionId === "") found.push("sessionRequired");
    if (file === null) found.push("fileType");
    setProblems(found);
    if (found.length > 0 || file === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const stored = await uploadFile(file, "import");
      const created = await createImportJob(stored.id, sessionId);
      setJobId(created.id);
      setPage(1);
      setErrorsOnly(false);
      setCommitKey(newActionKey());
    } catch (err) {
      if (err instanceof UploadRefused) setProblems([err.reason]);
      else setMessage(refusal(err));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (jobId === null) return;
    setBusy(true);
    setMessage(null);
    try {
      await commitImport(jobId, mode, commitKey);
      await qc.invalidateQueries({ queryKey: ["import-job", jobId] });
      await qc.invalidateQueries({ queryKey: ["students"] });
      toast({ tone: "success", title: t("committed") });
    } catch (err) {
      setMessage(refusal(err));
    } finally {
      setBusy(false);
    }
  }

  function refusal(err: unknown): string {
    const problem = err instanceof ApiError ? err.problem : null;
    if (problem?.status === 403) return tState("forbidden");
    return tState("refused", { code: problem?.code ?? "unknown" });
  }

  const current = job.data;
  // All-or-nothing needs a file with no errors; skip-errors commits the valid rows.
  const canCommit =
    current?.status === "Validated" && (mode === "SkipErrors" || Number(current.errorRows) === 0);

  const columns: Column<ImportRowView>[] = [
    { key: "row", header: t("rowColumn"), cell: (r) => String(r.rowNumber), numeric: true },
    {
      key: "status",
      header: t("rowStatus"),
      cell: (r) => (
        <StatusBadge tone={r.status === "Valid" ? "success" : "danger"}>{r.status}</StatusBadge>
      ),
    },
    {
      key: "errors",
      header: t("errors"),
      cell: (r) => (
        <ul className="flex flex-col gap-1 text-sm text-danger-foreground">
          {r.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      <StudentsTabs canImport={access.canImport} canPromote={false} />
      {access.readOnlyNotice ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {tState("readOnlyHint")}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4">
        <CardTitle>{t("step1")}</CardTitle>
        <div>
          <Button
            variant="secondary"
            onClick={async () => {
              setMessage(null);
              try {
                await downloadFromApi(TEMPLATE_PATH, "students-import-template.csv");
              } catch (err) {
                setMessage(refusal(err));
              }
            }}
          >
            {t("template")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>{t("step2")}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("session")}
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">—</option>
            {(sessions.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="import-file" className="text-sm font-semibold text-foreground">
              {t("file")}
            </label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="min-h-11 w-full rounded-control border border-input-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-control file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:font-semibold file:text-brand-soft-foreground"
            />
          </div>
        </div>
        {problems.length > 0 ? (
          <ul role="alert" className="flex flex-col gap-1 text-sm text-danger-foreground">
            {problems.map((p) => (
              <li key={p}>{tRules(p)}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex justify-end">
          <Button onClick={start} loading={busy} loadingLabel={tState("loading")}>
            {t("upload")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <CardTitle>{t("step3")}</CardTitle>
        {jobId === null ? (
          <p className="text-sm text-muted-foreground">{t("noJob")}</p>
        ) : job.isPending ? (
          <SkeletonList rows={2} label={tState("loading")} />
        ) : job.isError ? (
          <ErrorState
            title={tState("errorTitle")}
            description={tState("errorBody")}
            problem={job.error instanceof ApiError ? job.error.problem : null}
            onRetry={() => void job.refetch()}
          />
        ) : current !== undefined ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge
                tone={
                  current.status === "Failed"
                    ? "danger"
                    : current.status === "Completed"
                      ? "success"
                      : "info"
                }
              >
                {current.status}
              </StatusBadge>
              {isImportWorking(current.status) ? (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {t("pollingHint")}
                </p>
              ) : null}
            </div>
            {current.message ? (
              <p className="text-sm text-muted-foreground">{current.message}</p>
            ) : null}
            <dl className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-control bg-background px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("total")}
                </dt>
                <dd className="font-display text-xl font-semibold tabular-nums">
                  {Number(current.totalRows)}
                </dd>
              </div>
              <div className="rounded-control bg-background px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("valid")}
                </dt>
                <dd className="font-display text-xl font-semibold tabular-nums">
                  {Number(current.validRows)}
                </dd>
              </div>
              <div className="rounded-control bg-background px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("errors")}
                </dt>
                <dd className="font-display text-xl font-semibold tabular-nums">
                  {Number(current.errorRows)}
                </dd>
              </div>
              <div className="rounded-control bg-background px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("created")}
                </dt>
                <dd className="font-display text-xl font-semibold tabular-nums">
                  {Number(current.createdRows)}
                </dd>
              </div>
            </dl>

            {!isImportWorking(current.status) ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5 accent-brand"
                      checked={errorsOnly}
                      onChange={(e) => {
                        setErrorsOnly(e.target.checked);
                        setPage(1);
                      }}
                    />
                    {t("errorsOnly")}
                  </label>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await downloadFromApi(
                          `/api/v1/students/import/${jobId}/errors.csv`,
                          "students-import-errors.csv",
                        );
                      } catch (err) {
                        setMessage(refusal(err));
                      }
                    }}
                  >
                    {t("errorCsv")}
                  </Button>
                </div>
                {rows.isPending ? (
                  <SkeletonList rows={2} label={tState("loading")} />
                ) : rows.data && rows.data.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("empty")}</p>
                ) : rows.data ? (
                  <>
                    <h3 className="font-display text-base font-semibold text-foreground">
                      {t("rowsTitle")}
                    </h3>
                    <ResponsiveTable
                      caption={t("rowsTitle")}
                      columns={columns}
                      rows={rows.data.items}
                      rowKey={(r) => String(r.rowNumber)}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <Button
                        variant="secondary"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        {tPaging("previous")}
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        {page} / {Number(rows.data.totalPages)}
                      </p>
                      <Button
                        variant="secondary"
                        disabled={page >= Number(rows.data.totalPages)}
                        onClick={() => setPage(page + 1)}
                      >
                        {tPaging("next")}
                      </Button>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}

            {current.status === "Validated" && access.canImport ? (
              <div className="flex flex-col gap-4 rounded-card border border-border bg-background p-5">
                <CardTitle className="text-base">{t("commit")}</CardTitle>
                <Select
                  label={t("mode")}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as (typeof IMPORT_MODES)[number])}
                >
                  <option value="SkipErrors">{t("modeSkip")}</option>
                  <option value="AllOrNothing">{t("modeAll")}</option>
                </Select>
                <div className="flex justify-end">
                  <Button
                    onClick={commit}
                    disabled={!canCommit}
                    loading={busy}
                    loadingLabel={tState("loading")}
                  >
                    {t("commit")}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
