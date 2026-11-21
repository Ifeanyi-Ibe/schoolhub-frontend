"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { SkeletonList } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/unwrap";
import { AcademicsTabs } from "./AcademicsTabs";
import { useAcademicsAccess } from "./access";
import { formatCalendarDate } from "./calendar-format";
import {
  academicSessionsQuery,
  sessionTermsQuery,
  setCurrentTerm,
  termSchoolDaysQuery,
  type AcademicSession,
  type Term,
} from "./sessions-api";

const SessionDialog = lazy(() =>
  import("./SessionDialogs").then((m) => ({ default: m.SessionDialog })),
);
const TermDialog = lazy(() => import("./SessionDialogs").then((m) => ({ default: m.TermDialog })));
const RolloverDialog = lazy(() =>
  import("./SessionDialogs").then((m) => ({ default: m.RolloverDialog })),
);
const ArchiveSessionDialog = lazy(() =>
  import("./SessionDialogs").then((m) => ({ default: m.ArchiveSessionDialog })),
);

export function SessionsView() {
  const t = useTranslations("academics.sessions");
  const tState = useTranslations("academics.state");
  const access = useAcademicsAccess();
  const qc = useQueryClient();
  const sessions = useQuery({ ...academicSessionsQuery, enabled: access.canRead });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AcademicSession | "new" | null>(null);
  const [addingTerm, setAddingTerm] = useState<Term | "new" | null>(null);
  const [rollingOver, setRollingOver] = useState(false);
  const [archiving, setArchiving] = useState<AcademicSession | null>(null);

  if (access.loading) return <SkeletonList rows={3} label={tState("loading")} />;
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

  const selected = sessions.data?.find((s) => s.id === selectedId) ?? null;
  const editable = access.writable && selected !== null && !selected.isArchived;

  const columns: Column<AcademicSession>[] = [
    { key: "name", header: t("columns.name"), cell: (s) => s.name },
    {
      key: "dates",
      header: t("columns.dates"),
      cell: (s) => `${formatCalendarDate(s.startsOn)} – ${formatCalendarDate(s.endsOn)}`,
    },
    {
      key: "status",
      header: t("columns.status"),
      cell: (s) => (s.isArchived ? t("archived") : s.isCurrent ? t("current") : ""),
    },
    {
      key: "actions",
      header: "",
      cell: (s) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setSelectedId(s.id)}
            aria-pressed={s.id === selectedId}
          >
            {t("showTerms")}
          </Button>
          {access.writable && !s.isArchived ? (
            <Button
              variant="ghost"
              onClick={() => setEditing(s)}
              aria-label={`${t("edit")}: ${s.name}`}
            >
              {t("edit")}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("intro")}
        actions={
          access.writable ? (
            <>
              <Button variant="secondary" onClick={() => setRollingOver(true)}>
                {t("rollover")}
              </Button>
              <Button onClick={() => setEditing("new")}>{t("new")}</Button>
            </>
          ) : null
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

      {sessions.isPending ? (
        <SkeletonList rows={3} label={tState("loading")} />
      ) : sessions.isError ? (
        <ErrorState
          title={tState("errorTitle")}
          description={tState("errorBody")}
          problem={sessions.error instanceof ApiError ? sessions.error.problem : null}
          onRetry={() => void sessions.refetch()}
        />
      ) : sessions.data.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card className="p-0">
          <ResponsiveTable
            caption={t("title")}
            columns={columns}
            rows={sessions.data}
            rowKey={(s) => s.id}
          />
        </Card>
      )}

      {selected === null ? (
        <p className="text-sm text-muted-foreground">{t("choose")}</p>
      ) : (
        <TermsPanel
          session={selected}
          editable={editable}
          onAddTerm={() => setAddingTerm("new")}
          onEditTerm={(term) => setAddingTerm(term)}
          onArchive={() => setArchiving(selected)}
        />
      )}

      <Suspense fallback={null}>
        {editing !== null ? (
          <SessionDialog
            session={editing === "new" ? null : editing}
            onOpenChange={(open) => !open && setEditing(null)}
          />
        ) : null}
        {addingTerm !== null && selected !== null ? (
          <TermDialog
            sessionId={selected.id}
            term={addingTerm === "new" ? null : addingTerm}
            onOpenChange={(open) => !open && setAddingTerm(null)}
          />
        ) : null}
        {rollingOver ? (
          <RolloverDialog onOpenChange={(open) => !open && setRollingOver(false)} />
        ) : null}
        {archiving !== null ? (
          <ArchiveSessionDialog
            session={archiving}
            onOpenChange={(open) => !open && setArchiving(null)}
          />
        ) : null}
      </Suspense>
    </div>
  );
}

function TermsPanel({
  session,
  editable,
  onAddTerm,
  onEditTerm,
  onArchive,
}: {
  session: AcademicSession;
  editable: boolean;
  onAddTerm: () => void;
  onEditTerm: (term: Term) => void;
  onArchive: () => void;
}) {
  const t = useTranslations("academics.sessions");
  const tState = useTranslations("academics.state");
  const access = useAcademicsAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const terms = useQuery({ ...sessionTermsQuery(session.id), enabled: access.canRead });
  const [openDays, setOpenDays] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function makeCurrent(term: Term) {
    setMessage(null);
    try {
      await setCurrentTerm(term.id);
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["session-terms", session.id] });
      await qc.invalidateQueries({ queryKey: ["academic-sessions"] });
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      setMessage(
        problem?.status === 403
          ? tState("forbidden")
          : tState("refused", { code: problem?.code ?? "unknown" }),
      );
    }
  }

  const columns: Column<Term>[] = [
    {
      key: "number",
      header: t("termColumns.number"),
      cell: (term) => String(term.number),
      numeric: true,
    },
    {
      key: "name",
      header: t("termColumns.name"),
      cell: (term) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          {term.name}
          {term.isCurrent ? (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-on-brand">
              {t("current")}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "dates",
      header: t("termColumns.dates"),
      cell: (term) => `${formatCalendarDate(term.startsOn)} – ${formatCalendarDate(term.endsOn)}`,
    },
    {
      key: "next",
      header: t("termColumns.nextTerm"),
      cell: (term) => (term.nextTermBegins ? formatCalendarDate(term.nextTermBegins) : "—"),
    },
    {
      key: "actions",
      header: "",
      cell: (term) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setOpenDays(openDays === term.id ? null : term.id)}
            aria-expanded={openDays === term.id}
          >
            {openDays === term.id ? t("hideDays") : t("showDays")}
          </Button>
          {editable ? (
            <>
              <Button
                variant="ghost"
                onClick={() => onEditTerm(term)}
                aria-label={`${t("editTerm")}: ${term.name}`}
              >
                {t("editTerm")}
              </Button>
              {!term.isCurrent ? (
                <Button variant="secondary" onClick={() => void makeCurrent(term)}>
                  {t("setCurrent")}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("termsTitle", { name: session.name })}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCalendarDate(session.startsOn)} – {formatCalendarDate(session.endsOn)}
            {session.isArchived ? (
              <span className="ml-2 font-semibold">{t("archivedNote")}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <Button
              variant="secondary"
              onClick={onArchive}
              aria-label={`${t("archive")}: ${session.name}`}
            >
              {t("archive")}
            </Button>
          ) : null}
          {editable ? <Button onClick={onAddTerm}>{t("addTerm")}</Button> : null}
        </div>
      </div>

      {terms.isPending ? (
        <SkeletonList rows={2} label={tState("loading")} />
      ) : terms.isError ? (
        <ErrorState
          title={tState("errorTitle")}
          description={tState("errorBody")}
          problem={terms.error instanceof ApiError ? terms.error.problem : null}
          onRetry={() => void terms.refetch()}
        />
      ) : terms.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noTerms")}</p>
      ) : (
        <>
          <ResponsiveTable
            caption={t("termsTitle", { name: session.name })}
            columns={columns}
            rows={terms.data}
            rowKey={(term) => term.id}
          />
          {openDays !== null ? <SchoolDaysPanel termId={openDays} /> : null}
        </>
      )}
      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
    </Card>
  );
}

/** The school days in one term: the total, the weekend and closed days, and what is left for teaching. */
function SchoolDaysPanel({ termId }: { termId: string }) {
  const t = useTranslations("academics.sessions");
  const tState = useTranslations("academics.state");
  const days = useQuery(termSchoolDaysQuery(termId));
  if (days.isPending) return <SkeletonList rows={1} label={tState("loading")} />;
  if (days.isError)
    return (
      <p role="alert" className="text-sm text-danger-foreground">
        {tState("errorBody")}
      </p>
    );
  const figures: Array<[string, string | number]> = [
    [t("totalDays"), days.data.totalDays],
    [t("weekendDays"), days.data.weekendDays],
    [t("closedDays"), days.data.closedDays],
    [t("schoolDays"), days.data.schoolDays],
  ];
  return (
    <section
      aria-label={t("showDays")}
      className="rounded-control border border-border bg-background p-4"
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {figures.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
