"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useMemo, useState } from "react";
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
import { levelsQuery } from "./api";
import {
  levelMappingsQuery,
  saveLevelMappings,
  subjectsQuery,
  type MappingView,
  type Subject,
} from "./catalogue-api";
import { useAcademicsAccess } from "./access";
const SubjectDialog = lazy(() =>
  import("./SubjectDialogs").then((m) => ({ default: m.SubjectDialog })),
);
const DeleteSubject = lazy(() =>
  import("./SubjectDialogs").then((m) => ({ default: m.DeleteSubjectDialog })),
);

export function SubjectsView() {
  const t = useTranslations("academics.subjects");
  const tState = useTranslations("academics.state");
  const tCat = useTranslations("academics.category");
  const access = useAcademicsAccess();
  const toast = useToast();
  const qc = useQueryClient();
  const subjects = useQuery({ ...subjectsQuery, enabled: access.canRead });
  const levels = useQuery({ ...levelsQuery, enabled: access.canRead });
  const [editing, setEditing] = useState<Subject | "new" | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const [levelId, setLevelId] = useState("");

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

  const columns: Column<Subject>[] = [
    {
      key: "code",
      header: t("columns.code"),
      cell: (s) => <span className="font-mono text-sm">{s.code}</span>,
    },
    { key: "name", header: t("columns.name"), cell: (s) => s.name },
    { key: "category", header: t("columns.category"), cell: (s) => tCat(s.category) },
    {
      key: "actions",
      header: "",
      cell: (s) =>
        access.writable ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(s)}>
              {t("edit")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setDeleting(s)}
              aria-label={`${t("delete")}: ${s.name}`}
            >
              {t("delete")}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("intro")}
        actions={
          access.writable ? <Button onClick={() => setEditing("new")}>{t("add")}</Button> : null
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

      {subjects.isPending ? (
        <SkeletonList rows={4} label={tState("loading")} />
      ) : subjects.isError ? (
        <ErrorState
          title={tState("errorTitle")}
          description={tState("errorBody")}
          problem={subjects.error instanceof ApiError ? subjects.error.problem : null}
          onRetry={() => void subjects.refetch()}
        />
      ) : subjects.data.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card className="p-0">
          <ResponsiveTable
            caption={t("title")}
            columns={columns}
            rows={subjects.data}
            rowKey={(s) => s.id}
          />
        </Card>
      )}

      <Card>
        <CardTitle>{t("mappingTitle")}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{t("mappingIntro")}</p>
        <div className="mt-4 max-w-sm">
          <label htmlFor="mapping-level" className="text-sm font-medium text-foreground">
            {t("mappingLevel")}
          </label>
          <select
            id="mapping-level"
            value={levelId}
            onChange={(e) => setLevelId(e.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-control border border-input-border bg-surface px-3 text-base text-foreground"
          >
            <option value="">{t("mappingEmpty")}</option>
            {(levels.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        {levelId !== "" ? (
          <Suspense fallback={<SkeletonList rows={3} label={tState("loading")} />}>
            <LevelMapping
              key={levelId}
              levelId={levelId}
              subjects={subjects.data ?? []}
              writable={access.writable}
              onSaved={() => {
                toast({ tone: "success", title: t("mappingsSaved") });
                void qc.invalidateQueries({ queryKey: ["class-level-subjects", levelId] });
              }}
            />
          </Suspense>
        ) : null}
      </Card>

      <Suspense fallback={null}>
        {editing !== null ? (
          <SubjectDialog
            subject={editing === "new" ? null : editing}
            onOpenChange={(open) => {
              if (!open) setEditing(null);
            }}
          />
        ) : null}
        {deleting !== null ? (
          <DeleteSubject
            subject={deleting}
            onOpenChange={(open) => {
              if (!open) setDeleting(null);
            }}
          />
        ) : null}
      </Suspense>
    </div>
  );
}

/** Ticks and compulsory flags for one class level. Saved only when changed; nothing is optimistic. */
function LevelMapping({
  levelId,
  subjects,
  writable,
  onSaved,
}: {
  levelId: string;
  subjects: Subject[];
  writable: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("academics.subjects");
  const tState = useTranslations("academics.state");
  const tCat = useTranslations("academics.category");
  const qc = useQueryClient();
  const mappings = useQuery(levelMappingsQuery(levelId));
  const initial = useMemo(() => toDraft(mappings.data ?? []), [mappings.data]);
  const [draft, setDraft] = useState<Record<string, { taken: boolean; compulsory: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const current = { ...initial, ...draft };
  const changed = JSON.stringify(sortedEntries(current)) !== JSON.stringify(sortedEntries(initial));

  if (mappings.isPending) return <SkeletonList rows={3} label={tState("loading")} />;
  if (mappings.isError)
    return (
      <ErrorState
        title={tState("errorTitle")}
        description={tState("errorBody")}
        problem={mappings.error instanceof ApiError ? mappings.error.problem : null}
        onRetry={() => void mappings.refetch()}
      />
    );
  if (subjects.length === 0)
    return <p className="mt-4 text-sm text-muted-foreground">{t("noSubjectsForMapping")}</p>;

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const body = subjects
        .filter((s) => current[s.id]?.taken)
        .map((s) => ({ subjectId: s.id, isCompulsory: current[s.id]?.compulsory === true }));
      await saveLevelMappings(levelId, body);
      setDraft({});
      onSaved();
      await qc.invalidateQueries({ queryKey: ["class-level-subjects", levelId] });
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      setMessage(
        problem?.status === 403
          ? tState("forbidden")
          : tState("refused", { code: problem?.code ?? "unknown" }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <ul className="grid gap-2 sm:grid-cols-2">
        {subjects.map((s) => {
          const row = current[s.id] ?? { taken: false, compulsory: false };
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-background px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{s.code}</span> · {tCat(s.category)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <label className="inline-flex min-h-11 items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="size-5 accent-brand"
                    checked={row.taken}
                    disabled={!writable}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        [s.id]: {
                          taken: e.target.checked,
                          compulsory: row.compulsory && e.target.checked,
                        },
                      }))
                    }
                  />
                  {t("taken")}
                </label>
                <label className="inline-flex min-h-11 items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="size-5 accent-brand"
                    checked={row.compulsory}
                    disabled={!writable || !row.taken}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        [s.id]: { taken: row.taken, compulsory: e.target.checked },
                      }))
                    }
                  />
                  {t("compulsory")}
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
      {writable ? (
        <div className="flex justify-end">
          <Button
            onClick={save}
            disabled={!changed}
            loading={saving}
            loadingLabel={tState("loading")}
          >
            {t("saveMappings")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function toDraft(rows: readonly MappingView[]) {
  const out: Record<string, { taken: boolean; compulsory: boolean }> = {};
  for (const r of rows) out[r.subjectId] = { taken: true, compulsory: r.isCompulsory };
  return out;
}

function sortedEntries(map: Record<string, { taken: boolean; compulsory: boolean }>) {
  return Object.keys(map)
    .sort()
    .map((k) => [k, map[k]!.taken, map[k]!.compulsory]);
}
