"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ShieldIcon } from "@/components/ui/icons";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import { ApiError } from "@/lib/api/unwrap";
import { rolesQuery } from "./api";
import { PERMISSION, holdsAny, hasCustomRoles } from "./rules";

// The create form loads when it is opened (see CreateRoleDialog.tsx).
const CreateRoleDialog = lazy(() =>
  import("./CreateRoleDialog").then((m) => ({ default: m.CreateRoleDialog })),
);

/** Roles in the school. Custom roles need the plan's custom-role feature; built-in roles are read-only without it. */
export function RolesView() {
  const t = useTranslations("staff.roles");
  const readOnly = useReadOnly();
  const me = useQuery(meQuery);
  const tenant = useQuery(tenantQuery);
  const roles = useQuery({
    ...rolesQuery,
    enabled: me.data !== undefined && canSee(me.data.permissions),
  });
  const [creating, setCreating] = useState(false);

  if (me.data === undefined) {
    return (
      <div className="flex flex-col gap-6" aria-busy={me.isPending}>
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
        {me.isPending ? (
          <SkeletonList rows={3} label={t("loading")} />
        ) : (
          <ErrorState
            title={t("errorTitle")}
            description={t("errorBody")}
            problem={me.error instanceof ApiError ? me.error.problem : null}
            onRetry={() => void me.refetch()}
          />
        )}
      </div>
    );
  }
  if (!canSee(me.data.permissions)) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
        <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />
      </div>
    );
  }

  const canManage = holdsAny(me.data.permissions, [PERMISSION.manageRoles]);
  const customAllowed = tenant.data !== undefined && hasCustomRoles(tenant.data.entitlements);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("intro")}
        actions={
          canManage ? (
            <Button
              onClick={() => setCreating(true)}
              disabled={readOnly || !customAllowed}
              className="self-start sm:self-auto"
            >
              {t("newRole")}
            </Button>
          ) : null
        }
      />
      {canManage && !customAllowed ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("lockedHint")}
        </p>
      ) : null}

      {roles.isPending ? (
        <SkeletonList rows={3} label={t("loading")} />
      ) : roles.isError ? (
        <ErrorState
          title={t("errorTitle")}
          description={t("errorBody")}
          problem={roles.error instanceof ApiError ? roles.error.problem : null}
          onRetry={() => void roles.refetch()}
        />
      ) : roles.data.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("caption")}>
          {roles.data.map((r) => (
            <li key={r.id}>
              <Link
                href={`/roles/${r.id}`}
                className="group flex h-full flex-col gap-4 rounded-card border border-border/80 bg-surface p-5 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-raised focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transform-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex size-11 items-center justify-center rounded-control bg-brand-soft text-brand-soft-foreground">
                    <ShieldIcon className="size-5" />
                  </span>
                  <StatusBadge tone={r.isSystem ? "info" : "success"}>
                    {r.isSystem ? t("builtIn") : t("custom")}
                  </StatusBadge>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-semibold tracking-tight text-foreground group-hover:text-brand">
                    {r.name}
                    <span className="sr-only"> ({t("open")})</span>
                  </p>
                  {r.description ? (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {r.description}
                    </p>
                  ) : null}
                </div>
                <dl className="flex gap-6 border-t border-border/70 pt-4 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("columns.members")}
                    </dt>
                    <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-foreground">
                      {r.memberCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("columns.permissions")}
                    </dt>
                    <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-foreground">
                      {r.permissions.length}
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <Suspense fallback={null}>
          <CreateRoleDialog open onOpenChange={setCreating} mine={me.data.permissions} />
        </Suspense>
      ) : null}
    </div>
  );
}

function canSee(permissions: readonly string[]): boolean {
  return holdsAny(permissions, [PERMISSION.assignRoles, PERMISSION.manageRoles]);
}
