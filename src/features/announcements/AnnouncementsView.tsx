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
  announcementsQuery,
  cancelAnnouncement,
  createAnnouncement,
  previewAudience,
  sendAnnouncement,
  updateAnnouncement,
  type AnnouncementView,
  type AudiencePreviewView,
  type SendOutcome,
} from "./api";
import {
  AUDIENCES,
  CHANNELS,
  draftProblems,
  isOpen,
  needsIds,
  sendBlockedBy,
  type AnnouncementDraft,
} from "./rules";

export const ANNOUNCE_PERMISSION = "announcements.send";

const EMPTY: AnnouncementDraft = {
  title: "",
  body: "",
  audience: "all",
  ids: [],
  channels: ["inapp"],
};

/** Announcements to the school's families and staff (ADR 0025, slice 2). Nothing is sent without a checked audience and a confirmation. */
export function AnnouncementsView() {
  const t = useTranslations("announcements");
  const tState = useTranslations("announcements.state");
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const online = useOnline();
  const allowed = me.data !== undefined && holdsAny(me.data.permissions, [ANNOUNCE_PERMISSION]);
  const [page, setPage] = useState(1);
  const list = useQuery({ ...announcementsQuery(page), enabled: allowed });

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<AnnouncementDraft>(EMPTY);
  const [idsText, setIdsText] = useState("");
  const [tried, setTried] = useState(false);
  const [createKey, setCreateKey] = useState(() => newActionKey());
  const [sendKey, setSendKey] = useState(() => newActionKey());
  const [preview, setPreview] = useState<AudiencePreviewView | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (me.data !== undefined && !allowed)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;
  if (list.isError)
    return <ErrorState title={t("loadError")} onRetry={() => void list.refetch()} />;

  const writesAllowed = online;
  const items = list.data?.items ?? [];
  const totalPages = Number(list.data?.totalPages ?? 1);
  const problems = draftProblems({ ...draft, ids: idsText.split(/[\s,]+/).filter(Boolean) });
  const blocked = preview ? sendBlockedBy(preview, draft.channels) : null;
  const audienceLabel = (value: string) =>
    (AUDIENCES as readonly string[]).includes(value) ? t(`audience.${value}`) : value;
  const editingOpen = editing !== null ? items.find((a) => a.id === editing) : undefined;

  function pick(a: AnnouncementView) {
    setEditing(a.id);
    setDraft({
      title: a.title,
      body: a.body,
      audience: a.audience,
      ids: a.audienceIds,
      channels: a.channels,
    });
    setIdsText(a.audienceIds.join(", "));
    setPreview(null);
    setConfirmSend(false);
    setOutcome(null);
    setTried(false);
    setMessage(null);
  }

  function reset() {
    setEditing(null);
    setDraft(EMPTY);
    setIdsText("");
    setPreview(null);
    setConfirmSend(false);
    setOutcome(null);
    setTried(false);
    setMessage(null);
  }

  function toggleChannel(channel: string) {
    setPreview(null);
    setDraft({
      ...draft,
      channels: draft.channels.includes(channel)
        ? draft.channels.filter((c) => c !== channel)
        : [...draft.channels, channel],
    });
  }

  async function save() {
    setTried(true);
    if (problems.length > 0) return;
    setBusy("save");
    setMessage(null);
    const body = {
      ...draft,
      ids: needsIds(draft.audience) ? idsText.split(/[\s,]+/).filter(Boolean) : null,
      scheduledFor: null,
    };
    try {
      const saved = editing
        ? await updateAnnouncement(editing, body)
        : await createAnnouncement(body, createKey);
      if (!editing) setCreateKey(newActionKey());
      setEditing(saved.id);
      setMessage(t("saved"));
      await qc.invalidateQueries({ queryKey: ["announcements"] });
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function checkAudience() {
    setBusy("preview");
    setMessage(null);
    try {
      setPreview(
        await previewAudience({
          audience: draft.audience,
          ids: needsIds(draft.audience) ? idsText.split(/[\s,]+/).filter(Boolean) : null,
          channels: draft.channels,
          body: draft.body,
        }),
      );
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!editing) return;
    setBusy("send");
    setMessage(null);
    try {
      setOutcome(await sendAnnouncement(editing, sendKey));
      setSendKey(newActionKey());
      setConfirmSend(false);
      await qc.invalidateQueries({ queryKey: ["announcements"] });
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    setBusy("cancel");
    setMessage(null);
    try {
      await cancelAnnouncement(id, cancelReason.trim() || null);
      setCancelling(null);
      setCancelReason("");
      await qc.invalidateQueries({ queryKey: ["announcements"] });
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
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
        <h2 className="text-base font-semibold text-foreground">
          {editing ? t("compose.edit") : t("compose.new")}
        </h2>
        {editingOpen !== undefined && !isOpen(editingOpen) ? (
          <p className="text-sm text-muted-foreground">{t("compose.closed")}</p>
        ) : null}
        <Input
          label={t("compose.title")}
          value={draft.title}
          disabled={
            !writesAllowed ||
            (editing !== null && !isOpen(editingOpen ?? { sentAt: null, cancelledAt: null }))
          }
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          error={tried && draft.title.trim() === "" ? t("problem.titleRequired") : undefined}
        />
        <Input
          label={t("compose.body")}
          value={draft.body}
          disabled={!writesAllowed}
          onChange={(e) => {
            setPreview(null);
            setDraft({ ...draft, body: e.target.value });
          }}
          error={tried && draft.body.trim() === "" ? t("problem.bodyRequired") : undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("compose.audience")}
            value={draft.audience}
            disabled={!writesAllowed}
            onChange={(e) => {
              setPreview(null);
              setDraft({ ...draft, audience: e.target.value });
            }}
          >
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {t(`audience.${a}`)}
              </option>
            ))}
          </Select>
          {needsIds(draft.audience) ? (
            <Input
              label={t("compose.ids")}
              hint={t("compose.idsHint")}
              value={idsText}
              disabled={!writesAllowed}
              onChange={(e) => {
                setPreview(null);
                setIdsText(e.target.value);
              }}
              error={
                tried && problems.includes("idsRequired") ? t("problem.idsRequired") : undefined
              }
            />
          ) : null}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-foreground">{t("compose.channels")}</legend>
          <div className="flex flex-wrap gap-4">
            {CHANNELS.map((c) => (
              <label key={c} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={draft.channels.includes(c)}
                  disabled={!writesAllowed}
                  onChange={() => toggleChannel(c)}
                />
                {t(`channel.${c}`)}
              </label>
            ))}
          </div>
          {tried && draft.channels.length === 0 ? (
            <p className="text-sm text-danger-foreground">{t("problem.channelRequired")}</p>
          ) : null}
        </fieldset>
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            variant="secondary"
            onClick={checkAudience}
            disabled={!writesAllowed || busy !== null || draft.channels.length === 0}
            loading={busy === "preview"}
            loadingLabel={t("working")}
          >
            {t("compose.check")}
          </Button>
          {editing === null || (editingOpen !== undefined && isOpen(editingOpen)) ? (
            <Button
              onClick={save}
              disabled={!writesAllowed || busy !== null}
              loading={busy === "save"}
              loadingLabel={t("working")}
            >
              {editing ? t("compose.update") : t("compose.create")}
            </Button>
          ) : null}
          {editing ? (
            <Button variant="ghost" onClick={reset}>
              {t("compose.new")}
            </Button>
          ) : null}
        </div>

        {preview ? (
          <dl className="grid gap-2 rounded-control bg-background p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t("preview.recipients")}</dt>
              <dd className="tabular-nums font-semibold">{String(preview.recipients)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("preview.withPhone")}</dt>
              <dd className="tabular-nums">{String(preview.withPhone)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("preview.withEmail")}</dt>
              <dd className="tabular-nums">{String(preview.withEmail)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("preview.estimate")}</dt>
              <dd className="tabular-nums">{String(preview.estimatedSmsUnits)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("preview.available")}</dt>
              <dd className="tabular-nums">{String(preview.availableSmsUnits)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("preview.sufficient")}</dt>
              <dd>{preview.sufficient ? t("preview.yes") : t("preview.no")}</dd>
            </div>
          </dl>
        ) : null}
        {blocked ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {t("send.blocked")}
          </p>
        ) : null}
        {editing && editingOpen && isOpen(editingOpen) ? (
          confirmSend ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="mr-auto text-sm text-foreground">{t("send.confirm")}</p>
              <Button
                onClick={send}
                disabled={!writesAllowed || busy !== null || blocked !== null || !preview}
                loading={busy === "send"}
                loadingLabel={t("working")}
              >
                {t("send.now")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmSend(false)}
                disabled={busy !== null}
              >
                {t("cancelBtn")}
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button
                onClick={() => setConfirmSend(true)}
                disabled={!writesAllowed || busy !== null || !preview || blocked !== null}
              >
                {t("send.action")}
              </Button>
            </div>
          )
        ) : null}
        {outcome ? (
          <p role="status" className="text-sm text-foreground">
            {t("send.result", {
              queued: String(outcome.queued),
              inApp: String(outcome.inApp),
              suppressed: String(outcome.suppressed),
              duplicates: String(outcome.duplicates),
            })}
          </p>
        ) : null}
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </Card>

      <section aria-labelledby="ann-list" className="flex flex-col gap-3">
        <h2 id="ann-list" className="text-lg font-semibold text-foreground">
          {t("list.title")}
        </h2>
        {list.isPending && allowed ? <SkeletonList rows={3} label={tState("loading")} /> : null}
        {list.data && items.length === 0 ? (
          <EmptyState title={t("empty.title")} description={t("empty.body")} />
        ) : null}
        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{a.title}</p>
                  <span className="text-xs text-muted-foreground">
                    {a.sentAt
                      ? t("list.sent", { when: formatInstant(a.sentAt) })
                      : a.cancelledAt
                        ? t("list.cancelled")
                        : t("list.isOpen")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("list.meta", {
                    audience: audienceLabel(a.audience),
                    recipients: String(a.recipientCount),
                    status: a.status,
                    created: formatInstant(a.createdAt),
                  })}
                </p>
                <div className="flex flex-wrap justify-end gap-3">
                  {isOpen(a) ? (
                    <>
                      <Button variant="secondary" onClick={() => pick(a)} disabled={busy !== null}>
                        {t("list.openAction")}
                      </Button>
                      {cancelling === a.id ? (
                        <>
                          <Input
                            label={t("cancel.reason")}
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                          />
                          <Button
                            variant="secondary"
                            onClick={() => cancel(a.id)}
                            disabled={!writesAllowed || busy !== null}
                            loading={busy === "cancel"}
                            loadingLabel={t("working")}
                          >
                            {t("cancel.confirm")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={() => setCancelling(a.id)}
                          disabled={!writesAllowed || busy !== null}
                        >
                          {t("cancel.action")}
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
        {list.data && totalPages > 1 ? (
          <nav aria-label={t("pages")} className="flex items-center justify-between gap-3">
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
      </section>
    </div>
  );
}
