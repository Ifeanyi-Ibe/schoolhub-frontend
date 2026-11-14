"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/unwrap";
import { createRole, permissionCatalogQuery } from "./api";
import { PermissionChecklist } from "./PermissionChecklist";

// Loaded when the dialog opens (react-hook-form stays out of the roles list's first load).
export default CreateRoleDialog;

export function CreateRoleDialog({
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
      const problem = err instanceof ApiError ? err.problem : null;
      setMessage(
        problem?.status === 403
          ? t("forbidden")
          : problem?.code
            ? t("refused", { code: problem.code })
            : t("failed"),
      );
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
