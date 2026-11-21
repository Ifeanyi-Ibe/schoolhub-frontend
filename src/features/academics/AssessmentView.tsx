"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonList } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/unwrap";
import { AcademicsTabs } from "./AcademicsTabs";
import { useAcademicsAccess } from "./access";
import {
  assessmentSchemesQuery,
  createAssessmentScheme,
  saveComponents,
  setDefaultAssessment,
  type AssessmentScheme,
} from "./catalogue-api";
import { ASSESSMENT_TOTAL, checkComponents, type ComponentDraft } from "./catalogue-rules";

export function AssessmentView() {
  const t = useTranslations("academics.assessment");
  const tState = useTranslations("academics.state");
  const access = useAcademicsAccess();
  const qc = useQueryClient();
  const schemes = useQuery({ ...assessmentSchemesQuery, enabled: access.canRead });
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selected = schemes.data?.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      <AcademicsTabs />
      {access.readOnlyNotice ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {tState("readOnlyHint")}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4">
          <CardTitle>{t("schemes")}</CardTitle>
          {schemes.isPending ? (
            <SkeletonList rows={2} label={tState("loading")} />
          ) : schemes.isError ? (
            <ErrorState
              title={tState("errorTitle")}
              description={tState("errorBody")}
              problem={schemes.error instanceof ApiError ? schemes.error.problem : null}
              onRetry={() => void schemes.refetch()}
            />
          ) : schemes.data.length === 0 ? (
            <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
          ) : (
            <ul className="flex flex-col gap-2" aria-label={t("schemes")}>
              {schemes.data.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    aria-pressed={s.id === selectedId}
                    className={`flex w-full min-h-11 items-center justify-between gap-3 rounded-control border px-4 py-3 text-left transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${s.id === selectedId ? "border-brand bg-brand-soft" : "border-border bg-background hover:bg-muted"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {s.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("componentCount", { count: s.components.length })}
                      </span>
                    </span>
                    {s.isDefault ? (
                      <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-on-brand">
                        {t("default")}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {access.writable ? <CreateScheme onCreated={(id) => setSelectedId(id)} /> : null}
        </Card>

        <Card>
          {selected === null ? (
            <p className="text-sm text-muted-foreground">{t("choose")}</p>
          ) : (
            <ComponentEditor key={selected.id} scheme={selected} writable={access.writable} />
          )}
        </Card>
      </div>
    </div>
  );
}

function CreateScheme({ onCreated }: { onCreated: (id: string) => void }) {
  const t = useTranslations("academics.assessment");
  const tState = useTranslations("academics.state");
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (name.trim() === "") {
      setMessage(t("schemeNameRequired"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const created = await createAssessmentScheme(name.trim());
      setName("");
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["assessment-schemes"] });
      onCreated(created.id);
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      setMessage(
        problem?.status === 403
          ? tState("forbidden")
          : tState("refused", { code: problem?.code ?? "unknown" }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3 border-t border-border pt-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <Input
        label={t("schemeName")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={message ?? undefined}
      />
      <Button type="submit" variant="secondary" loading={busy} loadingLabel={tState("loading")}>
        {t("create")}
      </Button>
    </form>
  );
}

interface Row {
  key: number;
  name: string;
  maxScore: string;
}

function withoutKey(row: Row) {
  const { key, ...rest } = row;
  void key;
  return rest;
}

/**
 * Components of one scheme, with the running total after each row. Save is offered only when the maximum
 * scores add up to exactly 100. A component's weight is sent as its maximum score; the order is its row.
 */
function ComponentEditor({ scheme, writable }: { scheme: AssessmentScheme; writable: boolean }) {
  const t = useTranslations("academics.assessment");
  const tState = useTranslations("academics.state");
  const tRules = useTranslations("academics.rules");
  const toast = useToast();
  const qc = useQueryClient();
  const initial = useMemo<Row[]>(
    () => scheme.components.map((c, i) => ({ key: i, name: c.name, maxScore: String(c.maxScore) })),
    [scheme],
  );
  const [rows, setRows] = useState<Row[]>(initial);
  const [nextKey, setNextKey] = useState(initial.length);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const drafts: ComponentDraft[] = rows.map((r) => ({ name: r.name, maxScore: r.maxScore }));
  const check = checkComponents(drafts);
  const changed = JSON.stringify(rows.map(withoutKey)) !== JSON.stringify(initial.map(withoutKey));
  const canSave = writable && check.valid && changed && !saving;

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const body = rows.map((r, index) => {
        const max = Number(r.maxScore.trim());
        return { name: r.name.trim(), maxScore: max, weight: max, order: index + 1 };
      });
      await saveComponents(scheme.id, body);
      toast({ tone: "success", title: t("componentsSaved") });
      await qc.invalidateQueries({ queryKey: ["assessment-schemes"] });
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

  async function makeDefault() {
    try {
      await setDefaultAssessment(scheme.id);
      await qc.invalidateQueries({ queryKey: ["assessment-schemes"] });
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      setMessage(
        problem?.status === 403
          ? tState("forbidden")
          : tState("refused", { code: problem?.code ?? "unknown" }),
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("componentsTitle", { name: scheme.name })}</CardTitle>
          <p
            className={`mt-1 text-sm font-semibold ${check.total === ASSESSMENT_TOTAL ? "text-success-foreground" : "text-muted-foreground"}`}
            aria-live="polite"
          >
            {t("runningTotal", { total: check.total })}
          </p>
        </div>
        {writable && !scheme.isDefault ? (
          <Button variant="secondary" onClick={makeDefault}>
            {t("setDefault")}
          </Button>
        ) : null}
      </div>

      <ol className="flex flex-col gap-3">
        {rows.map((r, index) => {
          const problems = check.rows[index] ?? [];
          const idBase = `component-${r.key}`;
          return (
            <li
              key={r.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-control border border-border bg-background p-4 sm:grid-cols-[minmax(0,1fr)_9rem_7rem]"
            >
              <div className="col-span-2 flex flex-col gap-3 sm:col-span-3 sm:grid sm:grid-cols-[minmax(0,1fr)_9rem_7rem] sm:items-end sm:gap-3">
                <Input
                  label={t("componentColumns.name")}
                  value={r.name}
                  disabled={!writable}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                  id={`${idBase}-name`}
                />
                <Input
                  label={t("componentColumns.max")}
                  inputMode="numeric"
                  value={r.maxScore}
                  disabled={!writable}
                  onChange={(e) => update(r.key, { maxScore: e.target.value })}
                  id={`${idBase}-max`}
                />
                <p className="text-sm text-muted-foreground sm:pb-3">
                  {t("componentColumns.running")}:{" "}
                  <span className="font-semibold text-foreground">{check.running[index] ?? 0}</span>
                </p>
              </div>
              {problems.length > 0 ? (
                <ul className="col-span-2 flex flex-col gap-1 text-sm text-danger-foreground sm:col-span-3">
                  {problems.map((p) => (
                    <li key={p}>{tRules(p)}</li>
                  ))}
                </ul>
              ) : null}
              {writable ? (
                <div className="col-span-2 flex justify-end sm:col-span-3">
                  <Button
                    variant="ghost"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    aria-label={t("removeComponent", { row: index + 1 })}
                  >
                    {t("removeComponent", { row: index + 1 })}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {check.overall.length > 0 ? (
        <ul
          role="alert"
          className="flex flex-col gap-1 rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {check.overall.map((p) => (
            <li key={p}>{tRules(p)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-success-foreground">{t("totalOk")}</p>
      )}
      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}

      {writable ? (
        <div className="flex flex-wrap justify-between gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setRows((rs) => [...rs, { key: nextKey, name: "", maxScore: "" }]);
              setNextKey((k) => k + 1);
            }}
          >
            {t("addComponent")}
          </Button>
          <Button
            onClick={save}
            disabled={!canSave}
            loading={saving}
            loadingLabel={tState("loading")}
          >
            {t("saveComponents")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
