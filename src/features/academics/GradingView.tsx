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
  createGradingScheme,
  deleteGradingScheme,
  gradingSchemesQuery,
  saveBands,
  setDefaultGrading,
  type GradingScheme,
} from "./catalogue-api";
import { checkBands, type BandDraft } from "./catalogue-rules";

export function GradingView() {
  const t = useTranslations("academics.grading");
  const tState = useTranslations("academics.state");
  const access = useAcademicsAccess();
  const qc = useQueryClient();
  const schemes = useQuery({ ...gradingSchemesQuery, enabled: access.canRead });
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
                        {t("bandCount", { count: s.bands.length })}
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
            <BandEditor
              key={selected.id}
              scheme={selected}
              writable={access.writable}
              onDeleted={() => setSelectedId(null)}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function CreateScheme({ onCreated }: { onCreated: (id: string) => void }) {
  const t = useTranslations("academics.grading");
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
      const created = await createGradingScheme(name.trim());
      setName("");
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["grading-schemes"] });
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
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      noValidate
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

function withoutKey(row: Row) {
  const { key, ...rest } = row;
  void key;
  return rest;
}

interface Row {
  key: number;
  min: string;
  max: string;
  grade: string;
  remark: string;
  gradePoint: string;
}

/** Band rows with live checks. Save is only offered when the bands cover 0 to 100 exactly. */
function BandEditor({
  scheme,
  writable,
  onDeleted,
}: {
  scheme: GradingScheme;
  writable: boolean;
  onDeleted: () => void;
}) {
  const t = useTranslations("academics.grading");
  const tState = useTranslations("academics.state");
  const tRules = useTranslations("academics.rules");
  const toast = useToast();
  const qc = useQueryClient();
  const initial = useMemo<Row[]>(
    () =>
      scheme.bands.map((b, i) => ({
        key: i,
        min: String(b.min),
        max: String(b.max),
        grade: b.grade,
        remark: b.remark,
        gradePoint: b.gradePoint === null ? "" : String(b.gradePoint),
      })),
    [scheme],
  );
  const [rows, setRows] = useState<Row[]>(initial);
  const [nextKey, setNextKey] = useState(initial.length);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const drafts: BandDraft[] = rows.map((r) => ({
    min: r.min,
    max: r.max,
    grade: r.grade,
    remark: r.remark,
  }));
  const check = checkBands(drafts);
  const changed = JSON.stringify(rows.map(withoutKey)) !== JSON.stringify(initial.map(withoutKey));
  const canSave = writable && check.valid && changed && !saving;

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const body = rows.map((r) => ({
        min: Number(r.min.trim()),
        max: Number(r.max.trim()),
        grade: r.grade.trim(),
        remark: r.remark.trim(),
        gradePoint:
          r.gradePoint.trim() === "" || Number.isNaN(Number(r.gradePoint))
            ? null
            : Number(r.gradePoint),
      }));
      await saveBands(scheme.id, body);
      toast({ tone: "success", title: t("bandsSaved") });
      await qc.invalidateQueries({ queryKey: ["grading-schemes"] });
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
      await setDefaultGrading(scheme.id);
      await qc.invalidateQueries({ queryKey: ["grading-schemes"] });
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      setMessage(
        problem?.status === 403
          ? tState("forbidden")
          : tState("refused", { code: problem?.code ?? "unknown" }),
      );
    }
  }

  async function remove() {
    try {
      await deleteGradingScheme(scheme.id);
      toast({ tone: "success", title: tState("deleted") });
      await qc.invalidateQueries({ queryKey: ["grading-schemes"] });
      onDeleted();
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
          <CardTitle>{t("bandsTitle", { name: scheme.name })}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {check.valid ? t("coverage") : t("bandCount", { count: rows.length })}
          </p>
        </div>
        {writable ? (
          <div className="flex flex-wrap gap-2">
            {!scheme.isDefault ? (
              <Button variant="secondary" onClick={makeDefault}>
                {t("setDefault")}
              </Button>
            ) : null}
            {!scheme.isDefault ? (
              <Button
                variant="danger"
                onClick={remove}
                aria-label={`${t("delete")}: ${scheme.name}`}
              >
                {t("delete")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r, index) => {
          const problems = check.rows[index] ?? [];
          const idBase = `band-${r.key}`;
          return (
            <fieldset
              key={r.key}
              className="rounded-control border border-border bg-background p-4"
            >
              <legend className="px-1 text-sm font-semibold text-foreground">
                {t("row", { row: index + 1 })}
              </legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Input
                  label={t("bandColumns.min")}
                  inputMode="numeric"
                  value={r.min}
                  disabled={!writable}
                  onChange={(e) => update(r.key, { min: e.target.value })}
                  id={`${idBase}-min`}
                />
                <Input
                  label={t("bandColumns.max")}
                  inputMode="numeric"
                  value={r.max}
                  disabled={!writable}
                  onChange={(e) => update(r.key, { max: e.target.value })}
                  id={`${idBase}-max`}
                />
                <Input
                  label={t("bandColumns.grade")}
                  value={r.grade}
                  disabled={!writable}
                  onChange={(e) => update(r.key, { grade: e.target.value })}
                  id={`${idBase}-grade`}
                />
                <Input
                  label={t("bandColumns.remark")}
                  value={r.remark}
                  disabled={!writable}
                  onChange={(e) => update(r.key, { remark: e.target.value })}
                  id={`${idBase}-remark`}
                  className="col-span-2 sm:col-span-1"
                />
                <Input
                  label={t("bandColumns.gradePoint")}
                  inputMode="decimal"
                  value={r.gradePoint}
                  disabled={!writable}
                  onChange={(e) => update(r.key, { gradePoint: e.target.value })}
                  id={`${idBase}-point`}
                />
              </div>
              {problems.length > 0 ? (
                <ul
                  className="mt-2 flex flex-col gap-1 text-sm text-danger-foreground"
                  aria-label={t("row", { row: index + 1 })}
                >
                  {problems.map((p) => (
                    <li key={p}>{tRules(p)}</li>
                  ))}
                </ul>
              ) : null}
              {writable ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    aria-label={t("removeBand", { row: index + 1 })}
                  >
                    {t("removeBand", { row: index + 1 })}
                  </Button>
                </div>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      {check.overall.length > 0 ? (
        <ul
          role="alert"
          className="flex flex-col gap-1 rounded-control bg-danger-surface px-4 py-3 text-sm text-danger-foreground"
        >
          {check.overall.map((p) => (
            <li key={p}>{tRules(p)}</li>
          ))}
        </ul>
      ) : null}
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
              setRows((rs) => [
                ...rs,
                { key: nextKey, min: "", max: "", grade: "", remark: "", gradePoint: "" },
              ]);
              setNextKey((k) => k + 1);
            }}
          >
            {t("addBand")}
          </Button>
          <Button
            onClick={save}
            disabled={!canSave}
            loading={saving}
            loadingLabel={tState("loading")}
          >
            {t("saveBands")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
