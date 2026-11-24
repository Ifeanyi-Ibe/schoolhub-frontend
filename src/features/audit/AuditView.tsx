"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { useOnline } from "@/components/ui/offline-status";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { downloadFromApi } from "@/features/files/download";
import { meQuery } from "@/features/shell/api";
import { holdsAny } from "@/features/staff/rules";
import { refusalText } from "@/features/students/refusal";
import { formatInstant } from "@/lib/format/dates";
import { ApiError } from "@/lib/api/unwrap";
import {
  auditExportDownloadPath,
  auditExportStatus,
  auditLogQuery,
  startAuditExport,
  type AuditExportView,
  type AuditFilters,
} from "./api";
import { exportFinished, OUTCOMES, rangeProblem } from "./rules";

export const AUDIT_PERMISSION = "audit.read";

const EMPTY_FILTERS: AuditFilters = { action: "", entityType: "", outcome: "", from: "", to: "" };

/** The audit log, filtered and paged by cursor, and its export (ADR 0025, slice 8). The export is built by the server; the screen waits for its answer. */
export function AuditView() {
  const t = useTranslations("audit");
  const tState = useTranslations("audit.state");
  const me = useQuery(meQuery);
  const online = useOnline();
  const allowed = me.data !== undefined && holdsAny(me.data.permissions, [AUDIT_PERMISSION]);

  const [draft, setDraft] = useState<AuditFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const page = cursors.length;
  const cursor = cursors[cursors.length - 1] ?? null;
  const log = useQuery({ ...auditLogQuery(filters, cursor), enabled: allowed });

  const [exportView, setExportView] = useState<AuditExportView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const exportStatus = useQuery({
    queryKey: ["audit-export", exportView?.id ?? ""],
    queryFn: async () => auditExportStatus(exportView?.id ?? ""),
    enabled: exportView !== null && !exportFinished(exportView.status),
    refetchInterval: (q) => (q.state.data && exportFinished(q.state.data.status) ? false : 2000),
  });
  const current: AuditExportView | null = exportStatus.data ?? exportView;

  if (me.data !== undefined && !allowed)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;
  if (log.isError) return <ErrorState title={t("loadError")} onRetry={() => void log.refetch()} />;

  const rangeError = rangeProblem(draft.from, draft.to);
  const items = log.data?.items ?? [];
  const writesAllowed = online;

  function applyFilters() {
    setTried(true);
    if (rangeError !== null) return;
    setFilters(draft);
    setCursors([null]);
    setMessage(null);
  }

  async function startExport() {
    setBusy(true);
    setMessage(null);
    try {
      setExportView(await startAuditExport(filters));
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!current) return;
    setMessage(null);
    try {
      await downloadFromApi(auditExportDownloadPath(current.id), t("export.fileName"));
    } catch {
      setMessage(t("export.failed"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      {!online ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {t("offline")}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            label={t("filter.action")}
            value={draft.action}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
          />
          <Input
            label={t("filter.entityType")}
            value={draft.entityType}
            onChange={(e) => setDraft({ ...draft, entityType: e.target.value })}
          />
          <Select
            label={t("filter.outcome")}
            value={draft.outcome}
            onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
          >
            <option value="">{t("filter.any")}</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {t(`outcome.${o}`)}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            label={t("filter.from")}
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
          <Input
            type="date"
            label={t("filter.to")}
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            error={tried && rangeError ? t("filter.reversed") : undefined}
          />
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={applyFilters}>
            {t("filter.apply")}
          </Button>
        </div>
      </Card>

      <section aria-labelledby="audit-list" className="flex flex-col gap-3">
        <h2 id="audit-list" className="text-lg font-semibold text-foreground">
          {t("list.title")}
        </h2>
        {log.isPending && allowed ? <SkeletonList rows={4} label={tState("loading")} /> : null}
        {log.data && items.length === 0 ? (
          <EmptyState title={t("empty.title")} description={t("empty.body")} />
        ) : null}
        <ul className="flex flex-col gap-2">
          {items.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 rounded-control border border-border p-3">
              <p className="text-sm font-medium text-foreground">{e.summary}</p>
              <p className="text-xs text-muted-foreground">
                {t("list.meta", {
                  when: formatInstant(e.occurredAt),
                  action: e.action,
                  actor: t(`actor.${e.actorType}`),
                  outcome: t(`outcome.${e.outcome}`),
                })}
              </p>
            </li>
          ))}
        </ul>
        {log.data ? (
          <nav aria-label={t("list.pages")} className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setCursors(cursors.slice(0, -1))}
            >
              {t("previous")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("pageNumber", { page: String(page) })}
            </p>
            <Button
              variant="secondary"
              disabled={!log.data.nextCursor}
              onClick={() => setCursors([...cursors, log.data?.nextCursor ?? null])}
            >
              {t("next")}
            </Button>
          </nav>
        ) : null}
      </section>

      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-foreground">{t("export.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("export.intro")}</p>
        <div className="flex justify-end">
          <Button
            onClick={startExport}
            disabled={
              !writesAllowed || busy || (current !== null && !exportFinished(current.status))
            }
            loading={busy}
            loadingLabel={t("working")}
          >
            {t("export.start")}
          </Button>
        </div>
        {current ? (
          <div role="status" className="flex flex-col gap-2 text-sm">
            <p className="text-foreground">
              {t("export.status", { status: t(`export.states.${current.status}`) })}
            </p>
            {current.errorCode ? (
              <p className="text-danger-foreground">
                {t("export.error", { code: current.errorCode })}
              </p>
            ) : null}
            {current.status === "Completed" ? (
              <div className="flex justify-end">
                <Button variant="secondary" onClick={download}>
                  {t("export.download")}
                </Button>
              </div>
            ) : null}
          </div>
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
