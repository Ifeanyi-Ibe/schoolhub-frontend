"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { meQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import type { components } from "@/lib/api/schema";
import { ApiError } from "@/lib/api/unwrap";
import { peopleQuery } from "./api";
// The invitation form (react-hook-form) loads when the dialog opens, not with the list. It is not needed
// for the first paint, and on a mid-range phone its script time delays that paint.
const InviteDialog = lazy(() =>
  import("./InviteDialog").then((m) => ({ default: m.InviteDialog })),
);
import { PERMISSION, holdsAny, parsePeopleQuery, peopleQueryParams } from "./rules";

type Person = components["schemas"]["UserView"];

/**
 * Staff accounts. The search and page live in the URL, so a filtered view can be bookmarked and the
 * back button returns to the same page. Permission is read from GET /me; nothing checks role names.
 */
export function PeopleView() {
  const t = useTranslations("staff.people");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const readOnly = useReadOnly();
  const me = useQuery(meQuery);
  const state = parsePeopleQuery(params);
  const [draft, setDraft] = useState(state.q);
  const [inviting, setInviting] = useState(false);

  const canSee =
    me.data !== undefined &&
    holdsAny(me.data.permissions, [PERMISSION.inviteUsers, PERMISSION.manageUsers]);
  const canInvite =
    me.data !== undefined && holdsAny(me.data.permissions, [PERMISSION.inviteUsers]);
  const people = useQuery({ ...peopleQuery(state), enabled: canSee });

  function go(next: { q: string; page: number }) {
    const query = peopleQueryParams(next).toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
  }

  if (me.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
        <SkeletonList rows={3} label={t("loading")} />
      </div>
    );
  }

  if (!canSee) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
        <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />
      </div>
    );
  }

  const columns: Column<Person>[] = [
    { key: "name", header: t("columns.name"), cell: (p) => p.displayName },
    {
      key: "contact",
      header: t("columns.contact"),
      cell: (p) => p.email ?? p.phone ?? "",
    },
    { key: "roles", header: t("columns.roles"), cell: (p) => p.roles.join(", ") },
    {
      key: "mfa",
      header: t("columns.mfa"),
      cell: (p) => (
        <StatusBadge tone={p.mfaEnabled ? "success" : "neutral"}>
          {p.mfaEnabled ? t("mfaOn") : t("mfaOff")}
        </StatusBadge>
      ),
    },
    {
      key: "status",
      header: t("columns.status"),
      cell: (p) => <span>{p.status}</span>,
    },
  ];

  const page = people.data;
  const totalPages = Number(page?.totalPages ?? 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        {canInvite ? (
          <Button
            onClick={() => setInviting(true)}
            disabled={readOnly}
            className="self-start sm:self-auto"
          >
            {t("invite")}
          </Button>
        ) : null}
      </div>
      {readOnly ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("readOnlyHint")}
        </p>
      ) : null}

      <form
        role="search"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: draft.trim(), page: 1 });
        }}
      >
        <Input
          label={t("search")}
          type="search"
          name="q"
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="sm:max-w-sm"
        />
        <Button type="submit" variant="secondary">
          {t("searchSubmit")}
        </Button>
      </form>

      {people.isPending ? (
        <SkeletonList rows={4} label={t("loading")} />
      ) : people.isError ? (
        <ErrorState
          title={t("errorTitle")}
          description={t("errorBody")}
          problem={people.error instanceof ApiError ? people.error.problem : null}
          onRetry={() => void people.refetch()}
        />
      ) : page !== undefined && page.items.length === 0 ? (
        state.q === "" ? (
          <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
        ) : (
          <EmptyState title={t("noMatch")} />
        )
      ) : page !== undefined ? (
        <Card className="p-0">
          <ResponsiveTable
            caption={t("caption")}
            columns={columns}
            rows={page.items}
            rowKey={(p) => p.id}
          />
          <nav
            aria-label={t("caption")}
            className="flex items-center justify-between gap-3 border-t border-border px-3 py-3"
          >
            <Button
              variant="secondary"
              disabled={state.page <= 1}
              onClick={() => go({ q: state.q, page: state.page - 1 })}
            >
              {t("previous")}
            </Button>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t("pageStatus", { page: state.page, total: totalPages })}
            </p>
            <Button
              variant="secondary"
              disabled={state.page >= totalPages}
              onClick={() => go({ q: state.q, page: state.page + 1 })}
            >
              {t("next")}
            </Button>
          </nav>
        </Card>
      ) : null}

      {inviting ? (
        <Suspense fallback={null}>
          <InviteDialog open onOpenChange={(open) => setInviting(open)} />
        </Suspense>
      ) : null}
    </div>
  );
}
