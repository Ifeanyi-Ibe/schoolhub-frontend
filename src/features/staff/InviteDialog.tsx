"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { meQuery } from "@/features/shell/api";
import { newActionKey } from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/unwrap";
import { inviteUser, rolesQuery, type InviteInput } from "./api";
import { canGrantRole, hasContact } from "./rules";

interface InviteValues {
  displayName: string;
  email: string;
  phone: string;
  roleIds: string[];
}

/** Messages for the refusals a person can fix. Anything else gets the general message. */
const CONTACT_CODES: Record<string, "emailTaken" | "phoneTaken" | "contactInvalid"> = {
  "users.email_taken": "emailTaken",
  "users.phone_taken": "phoneTaken",
  "users.contact_invalid": "contactInvalid",
};

export function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("staff.invite");
  const toast = useToast();
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const roles = useQuery(rolesQuery);
  const form = useForm<InviteValues>({
    defaultValues: { displayName: "", email: "", phone: "", roleIds: [] },
  });
  const [message, setMessage] = useState<string | null>(null);
  // One key per action. A retry with the same details reuses it; changed details get a new key.
  const [attempt, setAttempt] = useState<{ key: string; fingerprint: string } | null>(null);

  async function onSubmit(v: InviteValues) {
    setMessage(null);
    const input: InviteInput = {
      displayName: v.displayName.trim(),
      email: v.email.trim() === "" ? null : v.email.trim(),
      phone: v.phone.trim() === "" ? null : v.phone.trim(),
      roleIds: v.roleIds.length > 0 ? v.roleIds : null,
    };
    const fingerprint = JSON.stringify(input);
    const current =
      attempt?.fingerprint === fingerprint ? attempt : { key: newActionKey(), fingerprint };
    setAttempt(current);
    try {
      await inviteUser(input, current.key);
      setAttempt(null);
      toast({ tone: "success", title: t("sent", { name: input.displayName }) });
      await qc.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      const code = problem?.code ?? null;
      const contact = code !== null ? CONTACT_CODES[code] : undefined;
      if (contact) setMessage(t(contact));
      else if (problem?.status === 403) setMessage(t("forbidden"));
      else setMessage(t("failed"));
    }
  }

  const grantable = (roleId: string) => {
    const role = roles.data?.find((r) => r.id === roleId);
    return role !== undefined && me.data !== undefined && canGrantRole(role, me.data.permissions);
  };

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
            form="invite-form"
            loading={form.formState.isSubmitting}
            loadingLabel={t("sending")}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form
        id="invite-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <Input
          label={t("name")}
          required
          autoComplete="name"
          error={form.formState.errors.displayName?.message}
          {...form.register("displayName", {
            validate: (value) => value.trim() !== "" || t("nameRequired"),
          })}
        />
        <Input
          label={t("email")}
          type="email"
          autoComplete="email"
          error={form.formState.errors.email?.message}
          {...form.register("email", {
            validate: (value, all) => hasContact(value, all.phone) || t("contactRequired"),
          })}
        />
        <Input
          label={t("phone")}
          type="tel"
          autoComplete="tel"
          error={form.formState.errors.phone?.message}
          {...form.register("phone", {
            validate: (value, all) => hasContact(all.email, value) || t("contactRequired"),
          })}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t("roles")}</legend>
          <p className="text-sm text-muted-foreground">{t("rolesHint")}</p>
          {roles.data === undefined ? null : roles.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRoles")}</p>
          ) : (
            roles.data.map((role) => {
              const allowed = grantable(role.id);
              return (
                <label key={role.id} className="flex min-h-11 items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    value={role.id}
                    disabled={!allowed}
                    className="mt-1 size-5"
                    {...form.register("roleIds")}
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">{role.name}</span>
                    {allowed ? null : (
                      <span className="text-xs text-muted-foreground">{t("roleNotGrantable")}</span>
                    )}
                  </span>
                </label>
              );
            })
          )}
        </fieldset>
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
