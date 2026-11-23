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
import { SkeletonList } from "@/components/ui/skeleton";
import { meQuery } from "@/features/shell/api";
import { holdsAny } from "@/features/staff/rules";
import { refusalText } from "@/features/students/refusal";
import { formatInstant } from "@/lib/format/dates";
import { ApiError } from "@/lib/api/unwrap";
import {
  INBOX_PAGE_SIZE,
  inboxQuery,
  markAllRead,
  markRead,
  preferencesQuery,
  savePreferences,
} from "./api";
import { changedPreferences, clampPage, preferenceKey } from "./rules";

export const INBOX_PERMISSION = "me.notifications";

/** The staff inbox and the notification preferences (ADR 0025, slice 1). Every change is sent, and shown after the server answers. */
export function InboxView() {
  const t = useTranslations("inbox");
  const tState = useTranslations("inbox.state");
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const online = useOnline();
  const allowed = me.data !== undefined && holdsAny(me.data.permissions, [INBOX_PERMISSION]);

  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const inbox = useQuery({ ...inboxQuery(page, unreadOnly), enabled: allowed });
  const prefs = useQuery({ ...preferencesQuery(), enabled: allowed });
  const [edited, setEdited] = useState<Map<string, boolean>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (me.data !== undefined && !allowed)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;
  if (me.isError || inbox.isError)
    return <ErrorState title={t("loadError")} onRetry={() => void inbox.refetch()} />;

  const items = inbox.data?.items.items ?? [];
  const totalCount = inbox.data?.items.totalCount ?? 0;
  const lastPage = Math.max(1, Math.ceil(Number(totalCount) / INBOX_PAGE_SIZE));
  const writesAllowed = online;

  async function read(id: string) {
    setBusy(id);
    setMessage(null);
    try {
      await markRead(id);
      await qc.invalidateQueries({ queryKey: ["inbox"] });
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function readAll() {
    setBusy("all");
    setMessage(null);
    try {
      const done = await markAllRead();
      setMessage(t("markedAll", { count: String(done.marked) }));
      await qc.invalidateQueries({ queryKey: ["inbox"] });
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function savePrefs() {
    if (!prefs.data) return;
    const changes = changedPreferences(prefs.data.items, edited);
    if (changes.length === 0) return;
    setBusy("prefs");
    setMessage(null);
    try {
      const saved = await savePreferences(changes);
      qc.setQueryData(preferencesQuery().queryKey, saved);
      setEdited(new Map());
      setMessage(t("prefs.saved"));
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  const categories = [...new Set((prefs.data?.items ?? []).map((p) => p.category))];
  const channels = [...new Set((prefs.data?.items ?? []).map((p) => p.channel))];
  const current = (category: string, channel: string) => {
    const item = prefs.data?.items.find((p) => p.category === category && p.channel === channel);
    if (!item) return null;
    const key = preferenceKey(item);
    return { item, enabled: edited.get(key) ?? item.enabled };
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("intro", { unread: String(inbox.data?.unreadCount ?? 0) })}
      />
      {!online ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {t("offline")}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-5"
              checked={unreadOnly}
              onChange={(e) => {
                setUnreadOnly(e.target.checked);
                setPage(1);
              }}
            />
            {t("filter.unreadOnly")}
          </label>
          <Button
            variant="secondary"
            onClick={readAll}
            disabled={!writesAllowed || busy !== null || items.length === 0}
            loading={busy === "all"}
            loadingLabel={t("saving")}
          >
            {t("markAll")}
          </Button>
        </div>

        {inbox.isPending ? <SkeletonList rows={4} label={tState("loading")} /> : null}
        {inbox.data && items.length === 0 ? (
          <EmptyState title={t("empty.title")} description={t("empty.body")} />
        ) : null}

        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-control border border-border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {item.subject ?? t("noSubject")}
                </p>
                <span className="text-xs text-muted-foreground">
                  {item.readAt === null ? t("unread") : t("read")}
                </span>
              </div>
              <p className="text-sm text-foreground">{item.body}</p>
              <p className="text-xs text-muted-foreground">
                {t("meta", { category: item.category, when: formatInstant(item.deliveredAt) })}
              </p>
              {item.readAt === null ? (
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => read(item.id)}
                    disabled={!writesAllowed || busy !== null}
                    loading={busy === item.id}
                    loadingLabel={t("saving")}
                  >
                    {t("markOne")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {inbox.data && lastPage > 1 ? (
          <nav aria-label={t("pages")} className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage(clampPage(page - 1, totalCount, INBOX_PAGE_SIZE))}
            >
              {t("previous")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("pageOf", { page: String(page), total: String(lastPage) })}
            </p>
            <Button
              variant="secondary"
              disabled={page >= lastPage}
              onClick={() => setPage(clampPage(page + 1, totalCount, INBOX_PAGE_SIZE))}
            >
              {t("next")}
            </Button>
          </nav>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-foreground">{t("prefs.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("prefs.intro")}</p>
        {prefs.isPending && allowed ? <SkeletonList rows={3} label={tState("loading")} /> : null}
        {prefs.data && categories.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2 py-2 font-semibold">
                    {t("prefs.category")}
                  </th>
                  {channels.map((c) => (
                    <th key={c} scope="col" className="px-2 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat} className="border-t border-border">
                    <th scope="row" className="px-2 py-2 text-left font-medium">
                      {cat}
                    </th>
                    {channels.map((ch) => {
                      const cell = current(cat, ch);
                      if (!cell)
                        return (
                          <td key={ch} className="px-2 py-2">
                            —
                          </td>
                        );
                      return (
                        <td key={ch} className="px-2 py-2">
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              className="size-5"
                              checked={cell.enabled}
                              disabled={cell.item.locked || !writesAllowed}
                              aria-label={t("prefs.cell", { category: cat, channel: ch })}
                              onChange={(e) => {
                                const next = new Map(edited);
                                next.set(preferenceKey(cell.item), e.target.checked);
                                setEdited(next);
                              }}
                            />
                            {cell.item.locked ? (
                              <span className="text-xs text-muted-foreground">
                                {t("prefs.required")}
                              </span>
                            ) : null}
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button
            onClick={savePrefs}
            disabled={
              !writesAllowed ||
              busy !== null ||
              changedPreferences(prefs.data?.items ?? [], edited).length === 0
            }
            loading={busy === "prefs"}
            loadingLabel={t("saving")}
          >
            {t("prefs.save")}
          </Button>
        </div>
      </Card>

      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
