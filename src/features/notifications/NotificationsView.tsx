"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { meQuery } from "@/features/shell/api";
import { holdsAny } from "@/features/staff/rules";
import { refusalText } from "@/features/students/refusal";
import { formatInstant } from "@/lib/format/dates";
import { newActionKey } from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/unwrap";
import {
  MESSAGE_PAGE_SIZE,
  messagesQuery,
  previewTemplate,
  resetTemplate,
  retryMessage,
  saveTemplate,
  statsQuery,
  templatesQuery,
  walletQuery,
  type PreviewView,
  type TemplateView,
} from "./api";
import { canRetry, ratePercent, STATS_WINDOWS, templateProblem } from "./rules";

export const TEMPLATES_PERMISSION = "notifications.templates.manage";
export const MESSAGES_PERMISSION = "notifications.messages.read";
export const RETRY_PERMISSION = "notifications.messages.retry";

/** Templates, the message log with retries, statistics and the SMS wallet (ADR 0025, slice 3). Nothing is shown as sent before the server says so. */
export function NotificationsView() {
  const t = useTranslations("notifications");
  const tState = useTranslations("notifications.state");
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const online = useOnline();
  const granted = me.data?.permissions ?? [];
  const canTemplates = me.data !== undefined && holdsAny(granted, [TEMPLATES_PERMISSION]);
  const canMessages = me.data !== undefined && holdsAny(granted, [MESSAGES_PERMISSION]);
  const canRetryMessages = me.data !== undefined && holdsAny(granted, [RETRY_PERMISSION]);
  const anyAccess = canTemplates || canMessages;

  const templates = useQuery({ ...templatesQuery(), enabled: canTemplates });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const messages = useQuery({ ...messagesQuery(page, status, channel), enabled: canMessages });
  const [days, setDays] = useState<number>(30);
  const stats = useQuery({ ...statsQuery(days), enabled: canMessages });
  const wallet = useQuery({ ...walletQuery(), enabled: canMessages });

  const [editing, setEditing] = useState<TemplateView | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const [preview, setPreview] = useState<PreviewView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retryKeys, setRetryKeys] = useState<Record<string, string>>({});

  if (me.data !== undefined && !anyAccess)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;
  if (templates.isError && canTemplates)
    return <ErrorState title={t("loadError")} onRetry={() => void templates.refetch()} />;

  const writesAllowed = online;

  function openTemplate(tpl: TemplateView) {
    setEditing(tpl);
    setSubject(tpl.subject ?? "");
    setBody(tpl.body);
    setTried(false);
    setPreview(null);
    setMessage(null);
  }

  async function save() {
    if (!editing) return;
    setTried(true);
    if (templateProblem(body) !== null) return;
    setBusy("save");
    setMessage(null);
    try {
      const saved = await saveTemplate(editing.key, { subject: subject.trim() || null, body });
      setEditing(saved);
      setMessage(t("templates.saved"));
      await qc.invalidateQueries({ queryKey: ["notification-templates"] });
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!editing) return;
    setBusy("reset");
    setMessage(null);
    try {
      const back = await resetTemplate(editing.key);
      openTemplate(back);
      setMessage(t("templates.resetDone"));
      await qc.invalidateQueries({ queryKey: ["notification-templates"] });
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function checkPreview() {
    if (!editing) return;
    setBusy("preview");
    setMessage(null);
    try {
      setPreview(await previewTemplate(editing.key, { subject: subject.trim() || null, body }));
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function retry(id: string) {
    const key = retryKeys[id] ?? newActionKey();
    setRetryKeys({ ...retryKeys, [id]: key });
    setBusy(`retry-${id}`);
    setMessage(null);
    try {
      await retryMessage(id, key);
      setRetryKeys((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setMessage(t("messages.retried"));
      await qc.invalidateQueries({ queryKey: ["notification-messages"] });
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  const items = messages.data?.items ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil(Number(messages.data?.totalCount ?? 0) / MESSAGE_PAGE_SIZE),
  );

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

      {canTemplates ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">{t("templates.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("templates.intro")}</p>
          {templates.isPending ? <SkeletonList rows={3} label={tState("loading")} /> : null}
          <ul className="flex flex-col gap-2">
            {(templates.data ?? []).map((tpl) => (
              <li
                key={tpl.key}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{tpl.key}</p>
                  <p className="text-xs text-muted-foreground">
                    {tpl.isCustomised ? t("templates.customised") : t("templates.default")} ·{" "}
                    {t("templates.variables", { variables: tpl.variables.join(", ") || "—" })}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => openTemplate(tpl)}
                  disabled={busy !== null}
                >
                  {t("templates.edit")}
                </Button>
              </li>
            ))}
          </ul>
          {editing ? (
            <div className="flex flex-col gap-4 rounded-control border border-border p-4">
              <Input
                label={t("templates.subject")}
                value={subject}
                disabled={!writesAllowed}
                onChange={(e) => setSubject(e.target.value)}
              />
              <Input
                label={t("templates.body")}
                value={body}
                disabled={!writesAllowed}
                onChange={(e) => setBody(e.target.value)}
                error={tried && templateProblem(body) ? t("problem.bodyRequired") : undefined}
              />
              {preview ? (
                <div className="rounded-control bg-background p-3 text-sm">
                  {preview.subject ? (
                    <p className="font-semibold text-foreground">{preview.subject}</p>
                  ) : null}
                  <p className="whitespace-pre-line text-foreground">{preview.body}</p>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3">
                {editing.isCustomised ? (
                  <Button
                    variant="ghost"
                    onClick={reset}
                    disabled={!writesAllowed || busy !== null}
                    loading={busy === "reset"}
                    loadingLabel={t("working")}
                  >
                    {t("templates.reset.action")}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={checkPreview}
                  disabled={!writesAllowed || busy !== null || body.trim() === ""}
                  loading={busy === "preview"}
                  loadingLabel={t("working")}
                >
                  {t("templates.preview")}
                </Button>
                <Button
                  onClick={save}
                  disabled={!writesAllowed || busy !== null}
                  loading={busy === "save"}
                  loadingLabel={t("working")}
                >
                  {t("templates.save")}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {canMessages ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">{t("log.title")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t("log.status")}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("log.any")}</option>
              <option value="Sent">{t("log.statusSent")}</option>
              <option value="Failed">{t("log.statusFailed")}</option>
              <option value="Queued">{t("log.statusQueued")}</option>
            </Select>
            <Select
              label={t("log.channel")}
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("log.any")}</option>
              <option value="sms">{t("log.channelSms")}</option>
              <option value="email">{t("log.channelEmail")}</option>
              <option value="inapp">{t("log.channelInApp")}</option>
            </Select>
          </div>
          {messages.isPending ? <SkeletonList rows={3} label={tState("loading")} /> : null}
          {messages.data && items.length === 0 ? (
            <EmptyState title={t("log.empty.title")} description={t("log.empty.body")} />
          ) : null}
          <ul className="flex flex-col gap-3">
            {items.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-2 rounded-control border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {m.subject ?? m.templateKey}
                  </p>
                  <span className="text-xs text-muted-foreground">{m.status}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("log.meta", {
                    channel: m.channel,
                    category: m.category,
                    attempts: String(m.attempts),
                    created: formatInstant(m.createdAt),
                  })}
                  {m.maskedAddress ? ` · ${m.maskedAddress}` : ""}
                </p>
                {m.lastError ? (
                  <p className="text-xs text-danger-foreground">
                    {t("log.error", { error: m.lastError })}
                  </p>
                ) : null}
                {canRetryMessages && canRetry(m) ? (
                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => retry(m.id)}
                      disabled={!writesAllowed || busy !== null}
                      loading={busy === `retry-${m.id}`}
                      loadingLabel={t("working")}
                    >
                      {t("log.retry")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {messages.data && totalPages > 1 ? (
            <nav aria-label={t("log.pages")} className="flex items-center justify-between gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {t("previous")}
              </Button>
              <p className="text-sm text-muted-foreground">
                {t("pageOf", { page: String(page), total: String(totalPages) })}
              </p>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                {t("next")}
              </Button>
            </nav>
          ) : null}
        </Card>
      ) : null}

      {canMessages ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">{t("stats.title")}</h2>
            <Select
              label={t("stats.window")}
              value={String(days)}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {STATS_WINDOWS.map((d) => (
                <option key={d} value={d}>
                  {t("stats.days", { days: String(d) })}
                </option>
              ))}
            </Select>
            {stats.data ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("stats.total")}</dt>
                  <dd className="tabular-nums font-semibold">{String(stats.data.total)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("stats.success")}</dt>
                  <dd className="tabular-nums font-semibold">
                    {ratePercent(stats.data.successRatePercent)}
                  </dd>
                </div>
              </dl>
            ) : null}
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">{t("wallet.title")}</h2>
            {wallet.data ? (
              <>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("wallet.balance")}</dt>
                    <dd className="tabular-nums">{String(wallet.data.balance)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("wallet.reserved")}</dt>
                    <dd className="tabular-nums">{String(wallet.data.reserved)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("wallet.available")}</dt>
                    <dd className="tabular-nums font-semibold">{String(wallet.data.available)}</dd>
                  </div>
                </dl>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {wallet.data.recent.slice(0, 5).map((e, i) => (
                    <li key={i}>
                      {t("wallet.entry", {
                        kind: e.kind,
                        units: String(e.units),
                        when: formatInstant(e.occurredAt),
                      })}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>
        </div>
      ) : null}

      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
