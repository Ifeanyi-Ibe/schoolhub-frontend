"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useOnline } from "@/components/ui/offline-status";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { meQuery } from "@/features/shell/api";
import { holdsAny } from "@/features/staff/rules";
import { downloadFromApi } from "@/features/files/download";
import { refusalText } from "@/features/students/refusal";
import { formatInstant } from "@/lib/format/dates";
import { newActionKey } from "@/lib/api/idempotency";
import { useAssessmentAccess } from "./access";
import { armNamesQuery, myAssignmentsOnlyQuery, termsQuery } from "./api";
import {
  cardDownloadPath,
  cardsQuery,
  classResultsQuery,
  generateCards,
  jobQuery,
  publishCards,
  type CardView,
  type ClassKey,
  type GenerateCardsView,
  type PublishView,
} from "./results/api";
import { jobFinished, jobProgressPercent } from "./results/rules";

export const RESULTS_PUBLISH_PERMISSION = "results.publish";

/** Report cards for a class: generate them (a job), list them with their withheld state, download each PDF, and publish. */
export function ReportCardsView() {
  const t = useTranslations("reportCards");
  const tState = useTranslations("results.state");
  const qc = useQueryClient();
  const access = useAssessmentAccess();
  const me = useQuery(meQuery);
  const canPublish =
    me.data !== undefined && holdsAny(me.data.permissions, [RESULTS_PUBLISH_PERMISSION]);
  const online = useOnline();

  const assignments = useQuery(myAssignmentsOnlyQuery());
  const sessionId = assignments.data?.sessionId ?? "";
  const terms = useQuery({ ...termsQuery(sessionId), enabled: sessionId !== "" });
  const arms = useQuery(armNamesQuery());
  const [termChoice, setTermChoice] = useState("");
  const [armChoice, setArmChoice] = useState("");
  const current = terms.data?.find((x) => x.isCurrent) ?? terms.data?.[0];
  const termId = termChoice || current?.id || "";
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

  const cards = useQuery({
    ...cardsQuery(key ?? NO_CLASS),
    enabled: key !== null && access.canView,
  });
  const names = useQuery({
    ...classResultsQuery(key ?? NO_CLASS),
    enabled: key !== null && access.canView,
  });
  const nameOf = new Map((names.data ?? []).map((r) => [r.studentId, r] as const));

  const [layout, setLayout] = useState<"Primary" | "Secondary">("Primary");
  const [forceIncomplete, setForceIncomplete] = useState(false);
  const [generateKey, setGenerateKey] = useState(() => newActionKey());
  const [generated, setGenerated] = useState<GenerateCardsView | null>(null);
  const [jobId, setJobId] = useState("");
  const job = useQuery({
    ...jobQuery(jobId),
    enabled: jobId !== "",
    refetchInterval: (q) => (q.state.data && jobFinished(q.state.data) ? false : 2000),
  });
  const [published, setPublished] = useState<PublishView | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (access.loading) return <SkeletonList rows={4} label={tState("loading")} />;
  if (access.failed) return <ErrorState title={t("loadError")} />;
  if (!access.canView)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  const writesAllowed = online;
  const rows: CardView[] = cards.data ?? [];
  const jobData = job.data;

  async function generate() {
    if (!key) return;
    setBusy("generate");
    setMessage(null);
    try {
      const answer = await generateCards({ ...key, layout, forceIncomplete }, generateKey);
      setGenerated(answer);
      setJobId(answer.jobId);
      setGenerateKey(newActionKey());
      // The list was read before the cards existed: read it again now.
      await qc.invalidateQueries({ queryKey: cardsQuery(key).queryKey });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!key) return;
    setBusy("publish");
    setMessage(null);
    try {
      setPublished(await publishCards(key));
      setConfirmPublish(false);
      await qc.invalidateQueries({ queryKey: cardsQuery(key).queryKey });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(null);
    }
  }

  async function download(cardId: string) {
    setMessage(null);
    try {
      await downloadFromApi(cardDownloadPath(cardId), t("download.fileName"));
    } catch {
      setMessage(t("download.failed"));
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
      </Card>

      {access.canApprove ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">{t("generate.title")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t("generate.layout")}
              value={layout}
              onChange={(e) => setLayout(e.target.value === "Secondary" ? "Secondary" : "Primary")}
            >
              <option value="Primary">{t("generate.primary")}</option>
              <option value="Secondary">{t("generate.secondary")}</option>
            </Select>
            <label className="flex min-h-11 items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-1 size-5"
                checked={forceIncomplete}
                onChange={(e) => setForceIncomplete(e.target.checked)}
              />
              <span>
                {t("generate.force")}
                <span className="block text-xs text-muted-foreground">
                  {t("generate.forceHint")}
                </span>
              </span>
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={generate}
              disabled={
                !key ||
                !writesAllowed ||
                busy !== null ||
                (jobData !== undefined && !jobFinished(jobData))
              }
              loading={busy === "generate"}
              loadingLabel={t("generate.working")}
            >
              {t("generate.action")}
            </Button>
          </div>
          {generated ? (
            <p role="status" className="text-sm text-foreground">
              {t("generate.result", {
                generated: String(generated.generated),
                skipped: String(generated.skipped),
              })}
            </p>
          ) : null}
          {jobData ? (
            <div role="status" className="flex flex-col gap-2 text-sm">
              <p>{t("generate.job", { status: jobData.status })}</p>
              <div className="h-2 w-full rounded-full bg-background" aria-hidden="true">
                <div
                  className="h-2 rounded-full bg-brand"
                  style={{ width: `${jobProgressPercent(jobData)}%` }}
                />
              </div>
              <p className="text-muted-foreground">
                {t("generate.progress", {
                  done: String(jobData.done),
                  total: String(jobData.total),
                })}
              </p>
              {jobData.error ? (
                <p className="text-danger-foreground">
                  {t("generate.failed", { error: jobData.error })}
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {key && cards.isPending ? <SkeletonList rows={4} label={tState("loading")} /> : null}
      {key && cards.isError ? (
        <ErrorState title={t("loadError")} onRetry={() => void cards.refetch()} />
      ) : null}
      {key && cards.data && rows.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.body")} />
      ) : null}

      {rows.length > 0 ? (
        <section aria-labelledby="cards-title" className="flex flex-col gap-3">
          <h2 id="cards-title" className="text-lg font-semibold text-foreground">
            {t("list.title")}
          </h2>
          <ul className="flex flex-col gap-3">
            {rows.map((c) => {
              const who = nameOf.get(c.studentId);
              return (
                <li key={c.id}>
                  <Card className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {who?.studentName ?? t("list.unknownStudent")}
                      </p>
                      <StatusBadge
                        tone={c.feesWithheld ? "warning" : c.publishedAt ? "success" : "neutral"}
                      >
                        {c.feesWithheld
                          ? t("list.withheld")
                          : t("list.status", { status: c.status })}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("list.meta", {
                        layout: c.layout,
                        version: String(c.version),
                        generated: formatInstant(c.generatedAt),
                      })}
                      {c.publishedAt
                        ? ` · ${t("list.published", { when: formatInstant(c.publishedAt) })}`
                        : ""}
                    </p>
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        onClick={() => download(c.id)}
                        disabled={busy !== null}
                      >
                        {t("download.action")}
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {canPublish && key ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">{t("publish.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("publish.intro")}</p>
          {confirmPublish ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="mr-auto text-sm text-foreground">{t("publish.confirm")}</p>
              <Button
                onClick={publish}
                disabled={!writesAllowed || busy !== null}
                loading={busy === "publish"}
                loadingLabel={t("publish.working")}
              >
                {t("publish.now")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmPublish(false)}
                disabled={busy !== null}
              >
                {t("publish.cancel")}
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => setConfirmPublish(true)}
                disabled={!writesAllowed || busy !== null || rows.length === 0}
              >
                {t("publish.action")}
              </Button>
            </div>
          )}
          {published ? (
            <p role="status" className="text-sm text-foreground">
              {t("publish.result", {
                published: String(published.published),
                withheld: String(published.withheld),
              })}
            </p>
          ) : null}
        </Card>
      ) : null}

      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}

const NO_CLASS: ClassKey = { termId: "", classArmId: "" };
