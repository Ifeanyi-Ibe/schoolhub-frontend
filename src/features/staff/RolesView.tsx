"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { useReadOnly } from "@/features/shell/read-only";
import type { components } from "@/lib/api/schema";
import { ApiError } from "@/lib/api/unwrap";
import { createRole, permissionCatalogQuery, rolesQuery } from "./api";
import { PermissionChecklist } from "./PermissionChecklist";
import { PERMISSION, holdsAny, hasCustomRoles } from "./rules";

type Role = components["schemas"]["RoleView"];

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

  const columns: Column<Role>[] = [
    {
      key: "name",
      header: t("columns.name"),
      cell: (r) => (
        <Link
          href={`/roles/${r.id}`}
          className="font-medium text-brand underline-offset-2 hover:underline"
        >
          {r.name}
          <span className="sr-only"> ({t("open")})</span>
        </Link>
      ),
    },
    { key: "description", header: t("columns.description"), cell: (r) => r.description },
    {
      key: "members",
      header: t("columns.members"),
      cell: (r) => String(r.memberCount),
      numeric: true,
    },
    {
      key: "permissions",
      header: t("columns.permissions"),
      cell: (r) => String(r.permissions.length),
      numeric: true,
    },
    {
      key: "type",
      header: t("columns.type"),
      cell: (r) => (
        <StatusBadge tone="neutral">{r.isSystem ? t("builtIn") : t("custom")}</StatusBadge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        {canManage ? (
          <Button
            onClick={() => setCreating(true)}
            disabled={readOnly || !customAllowed}
            className="self-start sm:self-auto"
          >
            {t("newRole")}
          </Button>
        ) : null}
      </div>
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
        <Card className="p-0">
          <ResponsiveTable
            caption={t("caption")}
            columns={columns}
            rows={roles.data}
            rowKey={(r) => r.id}
          />
        </Card>
      )}

      {creating ? (
        <CreateRoleDialog open onOpenChange={setCreating} mine={me.data.permissions} />
      ) : null}
    </div>
  );
}

function canSee(permissions: readonly string[]): boolean {
  return holdsAny(permissions, [PERMISSION.assignRoles, PERMISSION.manageRoles]);
}

function CreateRoleDialog({
  open,
  onOpenChange,
  mine,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mine: readonly string[];
}) {
  const t = useTranslations("staff.createRole");
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const catalogue = useQuery(permissionCatalogQuery);
  const form = useForm<{ name: string; description: string }>({
    defaultValues: { name: "", description: "" },
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(v: { name: string; description: string }) {
    setMessage(null);
    try {
      const role = await createRole({
        name: v.name.trim(),
        description: v.description.trim(),
        permissions: selected,
      });
      toast({ tone: "success", title: t("created") });
      await qc.invalidateQueries({ queryKey: ["roles"] });
      onOpenChange(false);
      router.push(`/roles/${role.id}`);
    } catch (err) {
      const status = err instanceof ApiError ? err.problem.status : 0;
      setMessage(status === 403 ? t("forbidden") : t("failed"));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="create-role-form"
            loading={form.formState.isSubmitting}
            loadingLabel={t("submit")}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form
        id="create-role-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <Input
          label={t("name")}
          required
          error={form.formState.errors.name?.message}
          {...form.register("name", {
            validate: (value) => value.trim() !== "" || t("nameRequired"),
          })}
        />
        <Input label={t("descriptionLabel")} {...form.register("description")} />
        {catalogue.data !== undefined ? (
          <PermissionChecklist
            areas={catalogue.data}
            selected={selected}
            mine={mine}
            disabled={false}
            legend={t("title")}
            onToggle={(permission, checked) =>
              setSelected((prev) =>
                checked
                  ? [...prev.filter((p) => p !== permission), permission]
                  : prev.filter((p) => p !== permission),
              )
            }
          />
        ) : null}
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
