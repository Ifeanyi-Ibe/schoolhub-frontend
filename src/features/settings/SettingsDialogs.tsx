"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { uploadFile, UploadRefused } from "@/features/files/upload";
import { ApiError } from "@/lib/api/unwrap";
import { guardBrandColor, parseHex } from "@/lib/theme/contrast";
import {
  saveBranding,
  savePolicies,
  saveSchoolProfile,
  type Branding,
  type Policies,
  type SchoolProfile,
} from "./api";

type Translate = (key: string, values?: Record<string, string>) => string;

/**
 * The school logo is a verified upload (purpose SchoolLogo). The server stores its file id, never a URL, so the
 * field is a file picker: the chosen file is uploaded at once, and Save then sets it as the logo.
 */
function LogoField({
  logoId,
  onUploaded,
  onRemoved,
  register,
}: {
  logoId: string;
  onUploaded: (id: string) => void;
  onRemoved: () => void;
  register: React.ReactNode;
}) {
  const t = useTranslations("settings");
  const tState = useTranslations("academics.state");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const uploaded = await uploadFile(file, "logo");
      onUploaded(uploaded.id);
      setMessage(t("branding.logoUploaded"));
    } catch (err) {
      setMessage(
        err instanceof UploadRefused
          ? t(`branding.logoErrors.${err.reason}`)
          : refusal(err, tState),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {register}
      <p className="text-sm font-medium text-foreground">{t("branding.fields.logo")}</p>
      <p className="text-xs text-muted-foreground">
        {logoId !== "" ? t("branding.logoSet") : t("branding.logoNone")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-card hover:border-brand/40">
          <span>{t("branding.chooseLogo")}</span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void choose(file);
            }}
          />
        </label>
        {logoId !== "" ? (
          <Button variant="ghost" onClick={onRemoved} disabled={busy}>
            {t("branding.removeLogo")}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t("branding.logoHint")}</p>
      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function refusal(err: unknown, tState: (k: string, v?: Record<string, string>) => string): string {
  const problem = err instanceof ApiError ? err.problem : null;
  if (problem?.status === 403) return tState("forbidden");
  const base = tState("refused", { code: problem?.code ?? "unknown" });
  // The server names the fields it refused and says why; show them so the form can be corrected.
  const fields = Object.entries(problem?.errors ?? {})
    .map(([field, messages]) => `${field}: ${messages.join(" ")}`)
    .join(" ");
  return fields === "" ? base : `${base} ${fields}`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The server stores a colour as #RRGGBB only (SettingsCatalog). Shorthand such as #abc is refused, so it is refused here too. */
const SIX_DIGIT_HEX = /^#[0-9a-fA-F]{6}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The school's profile. Only the name is required by the screen; the server has the final say. */
export function ProfileDialog({
  initial,
  onOpenChange,
}: {
  initial: SchoolProfile;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings");
  const tState = useTranslations("academics.state");
  const toast = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<SchoolProfile>({ defaultValues: initial });
  const errors = form.formState.errors;

  async function onSubmit(v: SchoolProfile) {
    setMessage(null);
    try {
      await saveSchoolProfile({ ...initial, ...v, name: v.name.trim(), email: v.email.trim() });
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["settings", "school-profile"] });
      onOpenChange(false);
    } catch (err) {
      setMessage(refusal(err, tState));
    }
  }

  const fields: Array<[keyof SchoolProfile, string]> = [
    ["name", "profile.fields.name"],
    ["registrationNo", "profile.fields.registrationNo"],
    ["address", "profile.fields.address"],
    ["phones", "profile.fields.phones"],
    ["email", "profile.fields.email"],
    ["motto", "profile.fields.motto"],
    ["principalName", "profile.fields.principalName"],
    ["lga", "profile.fields.lga"],
    ["state", "profile.fields.state"],
  ];

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t("profile.title")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tState("cancel")}
          </Button>
          <Button
            type="submit"
            form="profile-form"
            loading={form.formState.isSubmitting}
            loadingLabel={tState("loading")}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <form
        id="profile-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit, () => undefined)}
        className="grid gap-4 sm:grid-cols-2"
      >
        {fields.map(([key, label]) => (
          <Input
            key={key}
            label={t(label)}
            error={
              key === "name" && errors.name
                ? t("validation.nameRequired")
                : key === "email" && errors.email
                  ? t("validation.email")
                  : undefined
            }
            {...form.register(key, {
              validate: (value) => {
                if (key === "name") return String(value ?? "").trim() !== "" || "required";
                if (key === "email")
                  return (
                    String(value ?? "").trim() === "" || EMAIL.test(String(value).trim()) || "email"
                  );
                return true;
              },
            })}
          />
        ))}
        {message ? (
          <p role="alert" className="col-span-full text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

/** Brand colours and the report-card header. Each colour is checked for contrast before it is saved. */
export function BrandingDialog({
  initial,
  onOpenChange,
}: {
  initial: Branding;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings");
  const tState = useTranslations("academics.state");
  const toast = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<Branding>({ defaultValues: initial });
  const primary = useWatch({ control: form.control, name: "primaryColor" });
  const secondary = useWatch({ control: form.control, name: "secondaryColor" });
  const primaryGuard = parseHex(primary ?? "") ? guardBrandColor(primary) : null;
  const logoId = useWatch({ control: form.control, name: "logo" });
  const secondaryGuard = parseHex(secondary ?? "") ? guardBrandColor(secondary) : null;

  async function onSubmit(v: Branding) {
    setMessage(null);
    try {
      await saveBranding({ ...initial, ...v });
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["settings", "branding"] });
      onOpenChange(false);
    } catch (err) {
      setMessage(refusal(err, tState));
    }
  }

  // A colour must be a six-digit hex value; the contrast note below says whether it is adjusted.
  const colourCheck = {
    validate: (value: string) => SIX_DIGIT_HEX.test(value ?? "") || t("validation.colour"),
    required: true as const,
  };

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t("branding.title")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tState("cancel")}
          </Button>
          <Button
            type="submit"
            form="branding-form"
            loading={form.formState.isSubmitting}
            loadingLabel={tState("loading")}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <form
        id="branding-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t("branding.fields.primaryColor")}
            hint={t("branding.colourHint")}
            error={form.formState.errors.primaryColor ? t("validation.colour") : undefined}
            {...form.register("primaryColor", colourCheck)}
          />
          <Input
            label={t("branding.fields.secondaryColor")}
            hint={t("branding.colourHint")}
            error={form.formState.errors.secondaryColor ? t("validation.colour") : undefined}
            {...form.register("secondaryColor", colourCheck)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ContrastNote label={t("branding.fields.primaryColor")} guard={primaryGuard} t={t} />
          <ContrastNote label={t("branding.fields.secondaryColor")} guard={secondaryGuard} t={t} />
        </div>
        <LogoField
          logoId={logoId ?? ""}
          onUploaded={(id) => form.setValue("logo", id, { shouldDirty: true })}
          onRemoved={() => form.setValue("logo", "", { shouldDirty: true })}
          register={<input type="hidden" {...form.register("logo")} />}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-header" className="text-sm font-medium text-foreground">
            {t("branding.fields.reportCardHeader")}
          </label>
          <textarea
            id="report-header"
            rows={3}
            className="w-full rounded-control border border-input-border bg-surface px-3 py-2 text-base text-foreground"
            {...form.register("reportCardHeader")}
          />
        </div>
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

function ContrastNote({
  label,
  guard,
  t,
}: {
  label: string;
  guard: ReturnType<typeof guardBrandColor> | null;
  t: Translate;
}) {
  if (guard === null)
    return <p className="text-sm text-muted-foreground">{t("branding.noPreview")}</p>;
  return (
    <div className="flex items-center gap-3 rounded-control border border-border bg-background p-3">
      <p className="text-sm text-foreground">
        <span className="font-semibold">{label}:</span>{" "}
        {guard.adjusted
          ? t("branding.adjusted", { accent: guard.accent, ratio: guard.ratio.toFixed(1) })
          : t("branding.passes", { ratio: guard.ratio.toFixed(1) })}
      </p>
    </div>
  );
}

interface PolicyForm {
  timezone: string;
  adminNoFormat: string;
  receiptNoFormat: string;
  invoiceNoFormat: string;
  feesClearedThresholdPct: string;
  lateCutoff: string;
  quietHours: string;
  requireFeesCleared: boolean;
  absenceAlert: boolean;
  excusedCountsAsPresent: boolean;
  requireMfaForAdmins: boolean;
  allowSupportAccess: boolean;
}

/** The contract's policy keys are dotted (for example results.requireFeesCleared). The form uses plain field
 * names, so react-hook-form does not nest them; the request is built back into the contract's flat keys. */
function toPolicyForm(p: Policies): PolicyForm {
  return {
    timezone: p.timezone,
    adminNoFormat: p.adminNoFormat,
    receiptNoFormat: p.receiptNoFormat,
    invoiceNoFormat: p.invoiceNoFormat,
    feesClearedThresholdPct: String(p["results.feesClearedThresholdPct"]),
    lateCutoff: p["attendance.lateCutoff"],
    quietHours: p["notifications.quietHours"],
    requireFeesCleared: p["results.requireFeesCleared"],
    absenceAlert: p["attendance.absenceAlert"],
    excusedCountsAsPresent: p["attendance.excusedCountsAsPresent"],
    requireMfaForAdmins: p["security.requireMfaForAdmins"],
    allowSupportAccess: p["security.allowSupportAccess"],
  };
}

function toPolicies(initial: Policies, f: PolicyForm): Policies {
  return {
    ...initial,
    timezone: f.timezone.trim(),
    adminNoFormat: f.adminNoFormat.trim(),
    receiptNoFormat: f.receiptNoFormat.trim(),
    invoiceNoFormat: f.invoiceNoFormat.trim(),
    "results.feesClearedThresholdPct": Number(f.feesClearedThresholdPct.trim()),
    "attendance.lateCutoff": f.lateCutoff.trim(),
    "notifications.quietHours": f.quietHours.trim(),
    "results.requireFeesCleared": f.requireFeesCleared,
    "attendance.absenceAlert": f.absenceAlert,
    "attendance.excusedCountsAsPresent": f.excusedCountsAsPresent,
    "security.requireMfaForAdmins": f.requireMfaForAdmins,
    "security.allowSupportAccess": f.allowSupportAccess,
  };
}

/** Numbering formats, the timezone, and the policies that change what staff and parents can see. */
export function PoliciesDialog({
  initial,
  onOpenChange,
}: {
  initial: Policies;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings");
  const tState = useTranslations("academics.state");
  const toast = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<PolicyForm>({ defaultValues: toPolicyForm(initial) });
  const errors = form.formState.errors;

  async function onSubmit(v: PolicyForm) {
    setMessage(null);
    try {
      await savePolicies(toPolicies(initial, v));
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["settings", "policies"] });
      onOpenChange(false);
    } catch (err) {
      setMessage(refusal(err, tState));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t("policies.title")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tState("cancel")}
          </Button>
          <Button
            type="submit"
            form="policies-form"
            loading={form.formState.isSubmitting}
            loadingLabel={tState("loading")}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <form
        id="policies-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t("policies.fields.timezone")}
            error={errors.timezone ? t("validation.required") : undefined}
            {...form.register("timezone", { validate: (v) => v.trim() !== "" })}
          />
          <Input label={t("policies.fields.adminNoFormat")} {...form.register("adminNoFormat")} />
          <Input
            label={t("policies.fields.receiptNoFormat")}
            {...form.register("receiptNoFormat")}
          />
          <Input
            label={t("policies.fields.invoiceNoFormat")}
            {...form.register("invoiceNoFormat")}
          />
          <Input
            label={t("policies.fields.feesClearedThreshold")}
            inputMode="numeric"
            error={errors.feesClearedThresholdPct ? t("validation.percent") : undefined}
            {...form.register("feesClearedThresholdPct", {
              validate: (v) => /^\d{1,3}$/.test(v.trim()) && Number(v.trim()) <= 100,
            })}
          />
          <Input
            label={t("policies.fields.lateCutoff")}
            hint={t("validation.timeHint")}
            error={errors.lateCutoff ? t("validation.time") : undefined}
            {...form.register("lateCutoff", { validate: (v) => TIME.test(v.trim()) })}
          />
          <Input label={t("policies.fields.quietHours")} {...form.register("quietHours")} />
        </div>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold text-foreground">{t("policies.toggles")}</legend>
          {(
            [
              ["requireFeesCleared", "policies.fields.requireFeesCleared"],
              ["absenceAlert", "policies.fields.absenceAlert"],
              ["excusedCountsAsPresent", "policies.fields.excusedCountsAsPresent"],
              ["requireMfaForAdmins", "policies.fields.requireMfaForAdmins"],
              ["allowSupportAccess", "policies.fields.allowSupportAccess"],
            ] as const
          ).map(([name, label]) => (
            <label
              key={name}
              className="inline-flex min-h-11 items-center gap-3 text-sm text-foreground"
            >
              <input type="checkbox" className="size-5 accent-brand" {...form.register(name)} />
              {t(label)}
            </label>
          ))}
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
