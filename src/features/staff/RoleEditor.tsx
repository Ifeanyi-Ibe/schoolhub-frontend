"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import type { components } from "@/lib/api/schema";
import { ApiError } from "@/lib/api/unwrap";
import { permissionCatalogQuery, rolesQuery, setRolePermissions } from "./api";
import { PermissionChecklist } from "./PermissionChecklist";
import { PERMISSION, hasCustomRoles, holdsAny } from "./rules";

type Role = components["schemas"]["RoleView"];

/**
 * One role and its permissions. The screen offers only what the server would accept: changes need
 * roles.manage, built-in roles change only with custom roles in the plan, and a permission can be
 * toggled only by someone who holds it. The server still decides, and its refusal is shown as is.
 */
export function RoleEditor({ roleId }: { roleId: string }) {
  const t = useTranslations("staff.role");
  const me = useQuery(meQuery);
  const tenant = useQuery(tenantQuery);
  const roles = useQuery(rolesQuery);

  if (me.data === undefined || roles.data === undefined) {
    if (me.isError || roles.isError) {
      const error = me.isError ? me.error : roles.error;
      return (
        <ErrorState
          title={t("errorTitle")}
          description={t("errorBody")}
          problem={error instanceof ApiError ? error.problem : null}
          onRetry={() => void (me.isError ? me.refetch() : roles.refetch())}
        />
      );
    }
    return <SkeletonList rows={4} label={t("loading")} />;
  }

  const role = roles.data.find((r) => r.id === roleId);
  if (role === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/roles" className="text-sm text-brand underline-offset-2 hover:underline">
          {t("back")}
        </Link>
        <EmptyState title={t("notFound")} />
      </div>
    );
  }

  return (
    <RoleForm
      key={role.id}
      role={role}
      mine={me.data.permissions}
      customAllowed={tenant.data !== undefined && hasCustomRoles(tenant.data.entitlements)}
      tenantKnown={tenant.data !== undefined}
    />
  );
}

function RoleForm({
  role,
  mine,
  customAllowed,
  tenantKnown,
}: {
  role: Role;
  mine: readonly string[];
  customAllowed: boolean;
  tenantKnown: boolean;
}) {
  const t = useTranslations("staff.role");
  const readOnly = useReadOnly();
  const toast = useToast();
  const qc = useQueryClient();
  const catalogue = useQuery(permissionCatalogQuery);
  // Initialised from the server's copy of the role. The form remounts when the role changes.
  const [selected, setSelected] = useState<string[]>(() => [...role.permissions]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const canManage = holdsAny(mine, [PERMISSION.manageRoles]);
  const builtInLocked = role.isSystem && !customAllowed;
  const editable = canManage && !readOnly && !builtInLocked && tenantKnown;
  const dirty =
    selected.length !== role.permissions.length ||
    selected.some((p) => !role.permissions.includes(p));

  async function save() {
    setMessage(null);
    setSaving(true);
    try {
      await setRolePermissions(role.id, selected);
      await qc.invalidateQueries({ queryKey: ["roles"] });
      setMessage({ tone: "success", text: t("saved") });
      toast({ tone: "success", title: t("saved") });
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      const text =
        problem?.status === 403
          ? t("forbidden")
          : problem?.code
            ? t("refused", { code: problem.code })
            : t("failed");
      setMessage({ tone: "error", text });
    } finally {
      setSaving(false);
    }
  }

  const catalogueReady = catalogue.data !== undefined;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/roles" className="text-sm text-brand underline-offset-2 hover:underline">
        {t("back")}
      </Link>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {t("title", { name: role.name })}
          </h1>
          <StatusBadge tone="neutral">{role.isSystem ? t("builtIn") : t("custom")}</StatusBadge>
        </div>
        <p className="text-sm text-muted-foreground">{role.description}</p>
      </div>

      {!canManage ? (
        <Banner tone="info" title={t("forbidden")} />
      ) : builtInLocked ? (
        <Banner tone="info" title={t("lockedHint")} />
      ) : null}
      <p className="text-sm text-muted-foreground">{t("permissionsHint")}</p>

      <Card>
        <CardTitle>{t("permissionsTitle")}</CardTitle>
        <div className="mt-4">
          {catalogue.isError ? (
            <ErrorState
              title={t("errorTitle")}
              description={t("errorBody")}
              problem={catalogue.error instanceof ApiError ? catalogue.error.problem : null}
              onRetry={() => void catalogue.refetch()}
            />
          ) : catalogueReady ? (
            <PermissionChecklist
              areas={catalogue.data}
              selected={selected}
              mine={mine}
              disabled={!editable || saving}
              legend={t("permissionsTitle")}
              onToggle={(permission, checked) =>
                setSelected((prev) =>
                  checked
                    ? [...prev.filter((p) => p !== permission), permission]
                    : prev.filter((p) => p !== permission),
                )
              }
            />
          ) : (
            <SkeletonList rows={3} label={t("loading")} />
          )}
        </div>
      </Card>

      {editable ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            onClick={() => void save()}
            disabled={!dirty || saving}
            loading={saving}
            loadingLabel={t("save")}
            className="self-start"
          >
            {t("save")}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error" ? "text-sm text-danger-foreground" : "text-sm text-foreground"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
