"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { SkeletonList } from "@/components/ui/skeleton";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import type { components } from "@/lib/api/schema";
import { ApiError } from "@/lib/api/unwrap";
import { PERMISSION, holdsAny } from "@/features/staff/rules";
import { armsQuery, levelsQuery } from "./api";
// The forms (react-hook-form) load when a dialog opens, not with the list (see the budgets).
const LevelDialog = lazy(() => import("./LevelDialogs").then((m) => ({ default: m.LevelDialog })));
const ArmDialog = lazy(() => import("./LevelDialogs").then((m) => ({ default: m.ArmDialog })));
import { CLASS_SECTIONS } from "./rules";

type Level = components["schemas"]["LevelView"];

type Arm = components["schemas"]["ArmView"];

/**
 * Class levels, and the arms of the level chosen in the URL (?level=). Reads need academics.read and
 * changes need academics.manage. Visibility is decided here from GET /me (UX only); the API decides.
 */
export function LevelsView() {
  const t = useTranslations("academics.levels");
  const tSection = useTranslations("academics.levelDialog");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const readOnly = useReadOnly();
  const me = useQuery(meQuery);
  const tenant = useQuery(tenantQuery);
  const selectedId = params.get("level");
  const [editing, setEditing] = useState<Level | "new" | null>(null);
  const [addingArm, setAddingArm] = useState<Level | null>(null);

  const canRead =
    me.data !== undefined &&
    holdsAny(me.data.permissions, [PERMISSION.academicsRead, PERMISSION.academicsManage]);
  const canManage =
    me.data !== undefined && holdsAny(me.data.permissions, [PERMISSION.academicsManage]);
  const levels = useQuery({ ...levelsQuery, enabled: canRead });
  const arms = useQuery({
    ...armsQuery(selectedId ?? ""),
    enabled: canRead && selectedId !== null,
  });

  if (me.data === undefined) {
    return me.isError ? (
      <ErrorState
        title={t("errorTitle")}
        description={t("errorBody")}
        problem={me.error instanceof ApiError ? me.error.problem : null}
        onRetry={() => void me.refetch()}
      />
    ) : (
      <SkeletonList rows={3} label={t("loading")} />
    );
  }
  if (!canRead) {
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;
  }

  const suspended = tenant.data?.suspended === true;
  const writable = canManage && !readOnly && !suspended;
  const selected = levels.data?.find((l) => l.id === selectedId);
  const columns: Column<Level>[] = [
    { key: "code", header: t("columns.code"), cell: (l) => l.code },
    { key: "name", header: t("columns.name"), cell: (l) => l.name },
    {
      key: "section",
      header: t("columns.section"),
      cell: (l) =>
        (CLASS_SECTIONS as readonly string[]).includes(l.section)
          ? tSection(`sections.${l.section}`)
          : l.section,
    },
    { key: "order", header: t("columns.order"), cell: (l) => String(l.order), numeric: true },
    {
      key: "actions",
      header: "",
      cell: (l) => (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => router.replace(`${pathname}?level=${l.id}`, { scroll: false })}
            aria-pressed={l.id === selectedId}
          >
            {t("arms")}
          </Button>
          {writable ? (
            <Button variant="ghost" onClick={() => setEditing(l)}>
              {t("edit")}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];
  const armColumns: Column<Arm>[] = [
    { key: "name", header: t("armColumns.name"), cell: (a) => a.name },
    {
      key: "capacity",
      header: t("armColumns.capacity"),
      cell: (a) => String(a.capacity),
      numeric: true,
    },
    { key: "form", header: t("armColumns.formTeacher"), cell: () => t("notAssigned") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        {writable ? (
          <Button onClick={() => setEditing("new")} className="self-start sm:self-auto">
            {t("add")}
          </Button>
        ) : null}
      </div>
      {suspended ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("readOnlyHint")}
        </p>
      ) : null}

      {levels.isPending ? (
        <SkeletonList rows={3} label={t("loading")} />
      ) : levels.isError ? (
        <ErrorState
          title={t("errorTitle")}
          description={t("errorBody")}
          problem={levels.error instanceof ApiError ? levels.error.problem : null}
          onRetry={() => void levels.refetch()}
        />
      ) : levels.data.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card className="p-0">
          <ResponsiveTable
            caption={t("caption")}
            columns={columns}
            rows={levels.data}
            rowKey={(l) => l.id}
          />
        </Card>
      )}

      {selected === undefined ? (
        <p className="text-sm text-muted-foreground">{t("chooseLevel")}</p>
      ) : (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("armsTitle", { level: selected.name })}</CardTitle>
            {writable ? (
              <Button variant="secondary" onClick={() => setAddingArm(selected)}>
                {t("addArm")}
              </Button>
            ) : null}
          </div>
          <div className="mt-4">
            {arms.isPending ? (
              <SkeletonList rows={2} label={t("loading")} />
            ) : arms.isError ? (
              <ErrorState
                title={t("errorTitle")}
                description={t("errorBody")}
                problem={arms.error instanceof ApiError ? arms.error.problem : null}
                onRetry={() => void arms.refetch()}
              />
            ) : arms.data.length === 0 ? (
              <EmptyState title={t("noArms")} />
            ) : (
              <ResponsiveTable
                caption={t("armsCaption")}
                columns={armColumns}
                rows={arms.data}
                rowKey={(a) => a.id}
              />
            )}
          </div>
        </Card>
      )}

      <Suspense fallback={null}>
        {editing !== null ? (
          <LevelDialog
            level={editing === "new" ? null : editing}
            onOpenChange={(open) => {
              if (!open) setEditing(null);
            }}
          />
        ) : null}
        {addingArm !== null ? (
          <ArmDialog
            levelId={addingArm.id}
            levelName={addingArm.name}
            onOpenChange={(open) => {
              if (!open) setAddingArm(null);
            }}
          />
        ) : null}
      </Suspense>
    </div>
  );
}
