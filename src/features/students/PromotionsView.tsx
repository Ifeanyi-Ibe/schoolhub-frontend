"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { academicSessionsQuery } from "@/features/academics/sessions-api";
import { newActionKey } from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/unwrap";
import { StudentsTabs } from "./StudentsTabs";
import { useArmOptions } from "./arms";
import { useStudentAccess } from "./access";
import {
  commitPromotion,
  previewPromotion,
  type PromotionPreview,
  type PromotionRequest,
} from "./api";

const OUTCOME_TONE: Record<string, StatusTone> = {
  Promote: "success",
  Repeat: "warning",
  Graduate: "info",
  Skip: "neutral",
};

/**
 * Promotions: preview who moves where, then commit. The preview changes nothing. The commit is idempotent: one key
 * per action, reused on retry, so a double click cannot promote anyone twice.
 */
export function PromotionsView() {
  const t = useTranslations("students.promotions");
  const tState = useTranslations("academics.state");
  const access = useStudentAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const sessions = useQuery({ ...academicSessionsQuery, enabled: access.canPromote });
  const arms = useArmOptions(access.canPromote);
  const [fromSessionId, setFromSessionId] = useState("");
  const [toSessionId, setToSessionId] = useState("");
  const [classArmId, setClassArmId] = useState("");
  const [targetArmId, setTargetArmId] = useState("");
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [request, setRequest] = useState<PromotionRequest | null>(null);
  const [actionKey, setActionKey] = useState(() => newActionKey());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (access.loading) return <SkeletonList rows={3} label={tState("loading")} />;
  if (!access.canPromote)
    return <EmptyState title={tState("noAccessTitle")} description={tState("noAccessBody")} />;

  const ready =
    fromSessionId !== "" &&
    toSessionId !== "" &&
    classArmId !== "" &&
    fromSessionId !== toSessionId;

  function refusal(err: unknown): string {
    const problem = err instanceof ApiError ? err.problem : null;
    if (problem?.status === 403) return tState("forbidden");
    return tState("refused", { code: problem?.code ?? "unknown" });
  }

  async function runPreview() {
    setBusy(true);
    setMessage(null);
    setPreview(null);
    const body: PromotionRequest = {
      fromSessionId,
      toSessionId,
      classArmId,
      targetClassArmId: targetArmId === "" ? null : targetArmId,
      outcomes: null,
    };
    try {
      const result = await previewPromotion(body);
      setPreview(result);
      setRequest(body);
      setActionKey(newActionKey());
    } catch (err) {
      setMessage(refusal(err));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (request === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const summary = await commitPromotion(request, actionKey);
      await qc.invalidateQueries({ queryKey: ["students"] });
      setMessage(
        summary.replayed
          ? t("replayed")
          : t("committed", {
              promoted: Number(summary.promoted),
              graduated: Number(summary.graduated),
            }),
      );
      toast({ tone: "success", title: t("commit") });
      setPreview(null);
      setRequest(null);
    } catch (err) {
      setMessage(refusal(err));
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<PreviewRow>[] = [
    { key: "name", header: t("name"), cell: (r) => r.fullName },
    {
      key: "outcome",
      header: t("outcome"),
      cell: (r) => (
        <StatusBadge tone={OUTCOME_TONE[r.outcome] ?? "neutral"}>
          {t(`outcome_${r.outcome}`)}
        </StatusBadge>
      ),
    },
    { key: "reason", header: t("reason"), cell: (r) => r.reason ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      <StudentsTabs canImport={false} canPromote={access.canPromote} />
      {access.readOnlyNotice ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {tState("readOnlyHint")}
        </p>
      ) : null}

      <Card className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("from")}
            value={fromSessionId}
            onChange={(e) => setFromSessionId(e.target.value)}
          >
            <option value="">—</option>
            {(sessions.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            label={t("to")}
            value={toSessionId}
            onChange={(e) => setToSessionId(e.target.value)}
          >
            <option value="">—</option>
            {(sessions.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            label={t("arm")}
            value={classArmId}
            onChange={(e) => setClassArmId(e.target.value)}
          >
            <option value="">—</option>
            {arms.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
          <Select
            label={t("target")}
            value={targetArmId}
            onChange={(e) => setTargetArmId(e.target.value)}
          >
            <option value="">—</option>
            {arms.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
        {fromSessionId !== "" && fromSessionId === toSessionId ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {t("sameSession")}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button
            onClick={runPreview}
            disabled={!ready}
            loading={busy}
            loadingLabel={tState("loading")}
          >
            {t("preview")}
          </Button>
        </div>
      </Card>

      {preview !== null ? (
        <Card className="flex flex-col gap-5">
          <CardTitle>{t("preview")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("basis", { basis: preview.basis })}</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                [t("promoted"), preview.promoted],
                [t("repeated"), preview.repeated],
                [t("graduated"), preview.graduated],
                [t("skipped"), preview.skipped],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-control bg-background px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </dt>
                <dd className="font-display text-xl font-semibold tabular-nums">{Number(value)}</dd>
              </div>
            ))}
          </dl>
          {preview.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("rowsEmpty")}</p>
          ) : (
            <ResponsiveTable
              caption={t("preview")}
              columns={columns}
              rows={preview.rows}
              rowKey={(r) => r.studentId}
            />
          )}
          <div className="flex justify-end">
            <Button
              onClick={commit}
              disabled={busy || preview.rows.length === 0}
              loading={busy}
              loadingLabel={tState("loading")}
            >
              {t("commit")}
            </Button>
          </div>
        </Card>
      ) : null}

      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}

type PreviewRow = PromotionPreview["rows"][number];
