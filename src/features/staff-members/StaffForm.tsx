"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { GENDERS } from "@/features/students/rules";
import {
  EMPLOYMENT_TYPES,
  STAFF_TYPES,
  staffFieldProblems,
  type StaffDraft,
  type StaffField,
} from "./rules";

/**
 * The staff record form, used by the create screen and the edit dialog. Field errors appear after the first
 * attempt to save; the form sends nothing the rules refuse. A pending save disables the button (no idempotency
 * key is declared for staff writes; see BACKEND_GAPS B-35).
 */
export function StaffForm({
  initial,
  today,
  submitLabel,
  busy,
  serverMessage,
  onSubmit,
  onCancel,
}: {
  initial: StaffDraft;
  today: string;
  submitLabel: string;
  busy: boolean;
  serverMessage: string | null;
  onSubmit: (draft: StaffDraft) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("staffMembers");
  const [draft, setDraft] = useState(initial);
  const [tried, setTried] = useState(false);
  const problems = staffFieldProblems(draft, today);
  const count = Object.keys(problems).length;

  function set<K extends StaffField>(key: K, value: StaffDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function errorFor(key: StaffField): string | undefined {
    const problem = problems[key];
    return tried && problem ? t(`errors.${problem}`) : undefined;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (count === 0) onSubmit(draft);
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
      {tried && count > 0 ? (
        <p
          role="alert"
          className="rounded-control bg-danger-surface px-4 py-3 text-sm text-danger-foreground"
        >
          {t("checkFields", { count })}
        </p>
      ) : null}
      {serverMessage ? (
        <p
          role="alert"
          className="rounded-control bg-danger-surface px-4 py-3 text-sm text-danger-foreground"
        >
          {serverMessage}
        </p>
      ) : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg font-semibold text-foreground">
          {t("sections.person")}
        </legend>
        <Input
          label={t("form.firstName")}
          value={draft.firstName}
          onChange={(e) => set("firstName", e.target.value)}
          error={errorFor("firstName")}
          autoComplete="given-name"
          required
          maxLength={120}
        />
        <Input
          label={t("form.middleName")}
          value={draft.middleName}
          onChange={(e) => set("middleName", e.target.value)}
          error={errorFor("middleName")}
          maxLength={120}
        />
        <Input
          label={t("form.lastName")}
          value={draft.lastName}
          onChange={(e) => set("lastName", e.target.value)}
          error={errorFor("lastName")}
          autoComplete="family-name"
          required
          maxLength={120}
        />
        <Select
          label={t("form.gender")}
          value={draft.gender}
          onChange={(e) => set("gender", e.target.value)}
          error={errorFor("gender")}
          required
        >
          <option value="">{t("form.choose")}</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {t(`genders.${g}`)}
            </option>
          ))}
        </Select>
        <Input
          label={t("form.dateOfBirth")}
          type="date"
          value={draft.dateOfBirth}
          onChange={(e) => set("dateOfBirth", e.target.value)}
          error={errorFor("dateOfBirth")}
          required
        />
        <Input
          label={t("form.phone")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={draft.phone}
          onChange={(e) => set("phone", e.target.value)}
          error={errorFor("phone")}
          hint={t("form.phoneHint")}
          required
        />
        <Input
          label={t("form.email")}
          type="email"
          autoComplete="email"
          value={draft.email}
          onChange={(e) => set("email", e.target.value)}
          error={errorFor("email")}
        />
        <Input
          label={t("form.address")}
          value={draft.address}
          onChange={(e) => set("address", e.target.value)}
          error={errorFor("address")}
          className="sm:col-span-2"
          maxLength={260}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg font-semibold text-foreground">
          {t("sections.employment")}
        </legend>
        <Select
          label={t("form.staffType")}
          value={draft.staffType}
          onChange={(e) => set("staffType", e.target.value)}
          error={errorFor("staffType")}
          required
        >
          {STAFF_TYPES.map((s) => (
            <option key={s} value={s}>
              {t(`types.${s}`)}
            </option>
          ))}
        </Select>
        <Select
          label={t("form.employmentType")}
          value={draft.employmentType}
          onChange={(e) => set("employmentType", e.target.value)}
          error={errorFor("employmentType")}
          required
        >
          {EMPLOYMENT_TYPES.map((s) => (
            <option key={s} value={s}>
              {t(`employment.${s}`)}
            </option>
          ))}
        </Select>
        <Input
          label={t("form.jobTitle")}
          value={draft.jobTitle}
          onChange={(e) => set("jobTitle", e.target.value)}
          error={errorFor("jobTitle")}
          required
          maxLength={80}
        />
        <Input
          label={t("form.department")}
          value={draft.department}
          onChange={(e) => set("department", e.target.value)}
          error={errorFor("department")}
          maxLength={80}
        />
        <Input
          label={t("form.hireDate")}
          type="date"
          value={draft.hireDate}
          onChange={(e) => set("hireDate", e.target.value)}
          error={errorFor("hireDate")}
          required
        />
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t("cancel")}
          </Button>
        ) : null}
        <Button type="submit" loading={busy} loadingLabel={t("saving")}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
