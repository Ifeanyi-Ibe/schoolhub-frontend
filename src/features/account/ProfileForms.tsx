"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { postAuth } from "@/features/auth/http";
import { passwordRules, requiredText } from "@/features/auth/rules";
import { useReadOnly } from "@/features/shell/read-only";
import { signOut } from "@/features/shell/sign-out";
import { apiClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";

// Loaded on demand by ProfileView (react-hook-form stays out of the profile route's first load).
type ContactValues = { channel: "email" | "phone"; value: string; code?: string };

export function ContactCard() {
  const t = useTranslations("profile");
  const readOnly = useReadOnly();
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<ContactValues>({
    defaultValues: { channel: "email", value: "", code: "" },
  });
  const qc = useQueryClient();

  async function onSubmit(v: ContactValues) {
    setMessage(null);
    try {
      if (!sent) {
        unwrap(
          await apiClient.POST("/api/v1/me/contact/request", {
            body: { channel: v.channel, value: v.value },
          }),
        );
        setSent(true);
        setMessage(t("contactSent"));
      } else {
        unwrap(
          await apiClient.POST("/api/v1/me/contact/confirm", {
            body: { channel: v.channel, value: v.value, code: v.code ?? "" },
          }),
        );
        setSent(false);
        form.reset({ channel: v.channel, value: "", code: "" });
        setMessage(t("contactDone"));
        await qc.invalidateQueries({ queryKey: ["me"] });
      }
    } catch {
      setMessage(t("contactFailed"));
    }
  }

  return (
    <Card>
      <CardTitle>{t("contactTitle")}</CardTitle>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("channel")}
          <select
            className="min-h-11 rounded-control border border-input-border bg-surface px-3 text-base"
            disabled={readOnly || sent}
            {...form.register("channel")}
          >
            <option value="email">{t("channelEmail")}</option>
            <option value="phone">{t("channelPhone")}</option>
          </select>
        </label>
        <Input
          label={t("value")}
          disabled={readOnly || sent}
          {...form.register("value", requiredText(t("valueRequired")))}
        />
        {sent ? (
          <Input
            label={t("code")}
            inputMode="numeric"
            autoComplete="one-time-code"
            {...form.register("code")}
          />
        ) : null}
        {message ? (
          <p role="status" className="text-sm">
            {message}
          </p>
        ) : null}
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          loadingLabel={t("sendCode")}
          disabled={readOnly}
          className="self-start"
        >
          {sent ? t("confirm") : t("sendCode")}
        </Button>
      </form>
    </Card>
  );
}

export function ChangePasswordCard() {
  const t = useTranslations("profile");
  const readOnly = useReadOnly();
  const router = useRouter();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  async function onSubmit(v: { currentPassword: string; newPassword: string }) {
    setMessage(null);
    const call = await postAuth("password/change", v);
    if (call.ok) {
      // The backend ends every session on a password change; this device is signed out too.
      await signOut({ queryClient: qc }).catch(() => undefined);
      router.replace("/login?signedOut=1");
      return;
    }
    form.setValue("currentPassword", "");
    form.setValue("newPassword", "");
    setMessage(call.status === 400 ? t("checkFields") : t("passwordFailed"));
  }

  return (
    <Card>
      <CardTitle>{t("changeTitle")}</CardTitle>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4">
        <Input
          label={t("current")}
          type="password"
          autoComplete="current-password"
          disabled={readOnly}
          error={form.formState.errors.currentPassword?.message}
          {...form.register("currentPassword", requiredText(t("currentRequired")))}
        />
        <Input
          label={t("next")}
          type="password"
          autoComplete="new-password"
          disabled={readOnly}
          error={form.formState.errors.newPassword?.message}
          {...form.register("newPassword", {
            ...passwordRules({ required: t("newTooShort"), tooShort: t("newTooShort") }),
            validate: (v: string) => v !== form.getValues("currentPassword") || t("newSame"),
          })}
        />
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          loadingLabel={t("change")}
          disabled={readOnly}
          className="self-start"
        >
          {t("change")}
        </Button>
      </form>
    </Card>
  );
}
