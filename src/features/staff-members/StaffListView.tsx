"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api/unwrap";
import { parseStaffPage, staffPageSearch, type StaffPageState } from "./page-params";
import { STAFF_STATUSES, STAFF_TYPES } from "./rules";
import { useStaffAccess } from "./access";
import { staffListQuery } from "./api";

const STATUS_TONE: Record<string, StatusTone> = {
  Active: "success",
  OnLeave: "warning",
  Resigned: "neutral",
  Terminated: "danger",
};

/** Staff records: search and filters live in the URL, so a filtered list can be bookmarked and shared. */
export function StaffListView() {
  const t = useTranslations("staffMembers");
  const tState = useTranslations("academics.state");
  const access = useStaffAccess();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = parseStaffPage(Object.fromEntries(params.entries()));
  const [draft, setDraft] = useState(state.q);
  const qc = useQueryClient();
  const list = useQuery({
    ...staffListQuery({
      q: state.q,
      staffType: state.staffType,
      status: state.status,
      page: state.page,
    }),
    enabled: access.canRead,
  });

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
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  function go(next: StaffPageState) {
    const query = staffPageSearch(next);
    router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
  }

  const filtered = state.q !== "" || state.staffType !== "" || state.status !== "";
  const total = Number(list.data?.totalCount ?? 0);
  const totalPages = Number(list.data?.totalPages ?? 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("intro")}
        actions={
          access.writable ? (
            <Link
              href="/staff/new"
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-brand px-4 text-sm font-semibold text-on-brand shadow-brand hover:bg-brand/90"
            >
              {t("add")}
            </Link>
          ) : null
        }
      />
      {access.readOnlyNotice ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {tState("readOnlyHint")}
        </p>
      ) : null}

      <Card>
        <form
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            go({ ...state, q: draft.trim(), page: 1 });
          }}
        >
          <Input
            label={t("search")}
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={100}
          />
          <Select
            label={t("staffType")}
            value={state.staffType}
            onChange={(e) => go({ ...state, staffType: e.target.value, page: 1 })}
          >
            <option value="">{t("typeAll")}</option>
            {STAFF_TYPES.map((s) => (
              <option key={s} value={s}>
                {t(`types.${s}`)}
              </option>
            ))}
          </Select>
          <Select
            label={t("statusFilter")}
            value={state.status}
            onChange={(e) => go({ ...state, status: e.target.value, page: 1 })}
          >
            <option value="">{t("statusAll")}</option>
            {STAFF_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statusLabels.${s}`)}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            {t("searchButton")}
          </Button>
        </form>
      </Card>

      {list.isPending ? (
        <SkeletonList rows={4} label={tState("loading")} />
      ) : list.isError ? (
        <ErrorState
          title={tState("errorTitle")}
          description={tState("errorBody")}
          problem={list.error instanceof ApiError ? list.error.problem : null}
          onRetry={() => void list.refetch()}
        />
      ) : list.data.items.length === 0 ? (
        filtered ? (
          <EmptyState title={t("noMatchTitle")} description={t("noMatchBody")} />
        ) : (
          <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("results", { count: total })}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.data.items.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/staff/${s.id}`}
                  className="group flex min-h-16 items-center gap-4 rounded-card border border-border/80 bg-surface p-4 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-raised focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transform-none"
                >
                  <Avatar name={s.fullName} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground group-hover:text-brand">
                      {s.fullName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.staffNo} · {s.jobTitle}
                    </p>
                  </div>
                  <StatusBadge tone={STATUS_TONE[s.status] ?? "neutral"}>
                    {t(`statusLabels.${s.status}`)}
                  </StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
          <nav
            aria-label={t("pageOf", { page: state.page, total: totalPages })}
            className="flex items-center justify-between gap-3 pt-2"
          >
            <Button
              variant="secondary"
              disabled={state.page <= 1}
              onClick={() => go({ ...state, page: state.page - 1 })}
            >
              {t("previous")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("pageOf", { page: state.page, total: totalPages })}
            </p>
            <Button
              variant="secondary"
              disabled={state.page >= totalPages}
              onClick={() => go({ ...state, page: state.page + 1 })}
            >
              {t("next")}
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}
