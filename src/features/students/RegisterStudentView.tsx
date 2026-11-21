"use client";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/unwrap";
import { newActionKey } from "@/lib/api/idempotency";
import { levelsQuery, armsQuery } from "@/features/academics/api";
import { academicSessionsQuery } from "@/features/academics/sessions-api";
import { useStudentAccess } from "./access";
import { registerStudent, type GuardianInput, type RegisterStudentRequest } from "./api";
import {
  GENDERS,
  MAX_GUARDIANS,
  guardianProblems,
  registrationProblems,
  type GuardianDraft,
  type RegistrationDraft,
} from "./rules";

const STEPS = ["details", "admission", "guardians", "review"] as const;
type Step = (typeof STEPS)[number];

/** Today in the school's timezone, as YYYY-MM-DD. */
function todayLagos(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
}

const EMPTY_GUARDIAN: GuardianDraft = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  relationship: "",
  priority: "1",
  isPrimaryPayer: false,
  isEmergencyContact: false,
  canPickup: false,
};

/**
 * Registers a student in four steps. Nothing is saved until the review step is submitted. A possible duplicate
 * stops the registration and shows the matching records; only a user with the override permission can register
 * anyway, and that is a new request with its own key.
 */
export function RegisterStudentView() {
  const t = useTranslations("students.register");
  const tField = useTranslations("students.field");
  const tRules = useTranslations("students.rules");
  const tReasons = useTranslations("students.reasons");
  const tState = useTranslations("academics.state");
  const access = useStudentAccess();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const sessions = useQuery({ ...academicSessionsQuery, enabled: access.writable });
  const levels = useQuery({ ...levelsQuery, enabled: access.writable });
  const arms = useQueries({
    queries: (levels.data ?? []).map((l) => ({ ...armsQuery(l.id), enabled: access.writable })),
  });

  const [step, setStep] = useState<Step>("details");
  const [errors, setErrors] = useState<string[]>([]);
  const [draft, setDraft] = useState<RegistrationDraft>({
    firstName: "",
    middleName: "",
    lastName: "",
    gender: "",
    dateOfBirth: "",
    address: "",
    admissionNo: "",
    admittedOn: todayLagos(),
    sessionId: "",
    classArmId: "",
    medicalNotes: "",
    specialNeedsNotes: "",
  });
  const [guardians, setGuardians] = useState<GuardianDraft[]>([{ ...EMPTY_GUARDIAN }]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [actionKey, setActionKey] = useState(() => newActionKey());

  if (access.loading) return <SkeletonList rows={4} label={tState("loading")} />;
  if (!access.writable)
    return <EmptyState title={tState("noAccessTitle")} description={tState("noAccessBody")} />;

  const today = todayLagos();
  const stepIndex = STEPS.indexOf(step);
  const armOptions = (levels.data ?? []).flatMap((level, i) =>
    (arms[i]?.data ?? []).map((arm) => ({ id: arm.id, label: `${level.name} · ${arm.name}` })),
  );

  function validateStep(): string[] {
    if (step === "details" || step === "admission") {
      return registrationProblems(draft, today).filter((code) =>
        step === "details"
          ? !["sessionRequired", "classArmRequired", "admittedOn", "admissionNoLength"].includes(
              code,
            )
          : ["sessionRequired", "classArmRequired", "admittedOn", "admissionNoLength"].includes(
              code,
            ),
      );
    }
    if (step === "guardians") {
      const out: string[] = [];
      if (guardians.length < 1) out.push("guardian.firstNameRequired");
      if (guardians.length > MAX_GUARDIANS) out.push("guardianLimit");
      for (const g of guardians) out.push(...guardianProblems(g));
      return out;
    }
    return [];
  }

  function next() {
    const problems = validateStep();
    setErrors(problems);
    if (problems.length > 0) return;
    setStep(STEPS[stepIndex + 1] ?? "review");
  }

  function buildInput(): RegisterStudentRequest {
    const guardianInputs: GuardianInput[] = guardians.map((g, i) => ({
      firstName: g.firstName.trim(),
      lastName: g.lastName.trim(),
      phone: g.phone.trim(),
      email: g.email.trim() === "" ? null : g.email.trim(),
      relationship: g.relationship.trim(),
      isPrimaryPayer: g.isPrimaryPayer,
      isEmergencyContact: g.isEmergencyContact,
      canPickup: g.canPickup,
      priority: Number(g.priority) || i + 1,
    }));
    return {
      firstName: draft.firstName.trim(),
      middleName: draft.middleName.trim() === "" ? null : draft.middleName.trim(),
      lastName: draft.lastName.trim(),
      gender: draft.gender as RegisterStudentRequest["gender"],
      dateOfBirth: draft.dateOfBirth.trim(),
      address: draft.address.trim() === "" ? null : draft.address.trim(),
      admissionNo: draft.admissionNo.trim() === "" ? null : draft.admissionNo.trim(),
      admittedOn: draft.admittedOn.trim(),
      sessionId: draft.sessionId,
      classArmId: draft.classArmId,
      medicalNotes: draft.medicalNotes.trim() === "" ? null : draft.medicalNotes.trim(),
      specialNeedsNotes:
        draft.specialNeedsNotes.trim() === "" ? null : draft.specialNeedsNotes.trim(),
      guardians: guardianInputs,
    };
  }

  async function submit(allowDuplicate: boolean, key: string) {
    setSubmitting(true);
    setMessage(null);
    try {
      const view = await registerStudent(buildInput(), key, allowDuplicate);
      toast({
        tone: "success",
        title: t("success", { name: `${draft.firstName} ${draft.lastName}`.trim() }),
      });
      await qc.invalidateQueries({ queryKey: ["students"] });
      router.replace(`/students/${view.student.id}`);
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      if (problem?.code === "students.possible_duplicate") {
        setCandidates(problem.errors?.candidateIds ?? []);
        setMessage(tReasons("duplicateRefused", { code: problem.code }));
        // A new request needs its own key: the same key may not be reused for a different request.
      } else if (problem?.status === 403) {
        setMessage(tState("forbidden"));
      } else {
        setMessage(tReasons("refused", { code: problem?.code ?? "unknown" }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function setGuardian(index: number, patch: Partial<GuardianDraft>) {
    setGuardians((gs) => gs.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />

      <ol
        className="grid grid-cols-4 gap-2"
        aria-label={t("stepOf", { step: stepIndex + 1, total: STEPS.length })}
      >
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-col gap-2">
            <span
              className={`h-1.5 rounded-full ${i <= stepIndex ? "bg-brand" : "bg-border"}`}
              aria-hidden="true"
            />
            <span
              className={`text-xs font-semibold ${i === stepIndex ? "text-foreground" : "text-muted-foreground"}`}
              aria-current={i === stepIndex ? "step" : undefined}
            >
              {t(`steps.${s}`)}
            </span>
          </li>
        ))}
      </ol>

      <Card className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t(`steps.${step}`)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("stepOf", { step: stepIndex + 1, total: STEPS.length })}
          </p>
        </div>

        {errors.length > 0 ? (
          <ul
            role="alert"
            className="flex flex-col gap-1 rounded-control bg-danger-surface px-4 py-3 text-sm text-danger-foreground"
          >
            {errors.map((code) => (
              <li key={code}>{tRules(code)}</li>
            ))}
          </ul>
        ) : null}

        {step === "details" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="sm:col-span-2 text-sm text-muted-foreground">{t("personalHint")}</p>
            <Input
              label={tField("firstName")}
              required
              value={draft.firstName}
              onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
            />
            <Input
              label={tField("middleName")}
              value={draft.middleName}
              onChange={(e) => setDraft({ ...draft, middleName: e.target.value })}
            />
            <Input
              label={tField("lastName")}
              required
              value={draft.lastName}
              onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
            />
            <Select
              label={tField("gender")}
              required
              value={draft.gender}
              onChange={(e) => setDraft({ ...draft, gender: e.target.value })}
            >
              <option value="">{tField("chooseGender")}</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g === "Female" ? "Female" : "Male"}
                </option>
              ))}
            </Select>
            <Input
              label={tField("dateOfBirth")}
              type="date"
              required
              value={draft.dateOfBirth}
              max={today}
              onChange={(e) => setDraft({ ...draft, dateOfBirth: e.target.value })}
            />
            <Input
              label={tField("address")}
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
            <Input
              label={tField("medicalNotes")}
              hint={t("sensitiveHint")}
              value={draft.medicalNotes}
              onChange={(e) => setDraft({ ...draft, medicalNotes: e.target.value })}
            />
            <Input
              label={tField("specialNeedsNotes")}
              hint={t("sensitiveHint")}
              value={draft.specialNeedsNotes}
              onChange={(e) => setDraft({ ...draft, specialNeedsNotes: e.target.value })}
            />
          </div>
        ) : null}

        {step === "admission" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="sm:col-span-2 text-sm text-muted-foreground">{t("admissionHint")}</p>
            <Input
              label={tField("admissionNo")}
              value={draft.admissionNo}
              onChange={(e) => setDraft({ ...draft, admissionNo: e.target.value })}
            />
            <Input
              label={tField("admittedOn")}
              type="date"
              required
              value={draft.admittedOn}
              max={today}
              onChange={(e) => setDraft({ ...draft, admittedOn: e.target.value })}
            />
            <Select
              label={tField("session")}
              required
              value={draft.sessionId}
              onChange={(e) => setDraft({ ...draft, sessionId: e.target.value })}
            >
              <option value="">{tField("chooseSession")}</option>
              {(sessions.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select
              label={tField("classArm")}
              required
              value={draft.classArmId}
              onChange={(e) => setDraft({ ...draft, classArmId: e.target.value })}
            >
              <option value="">{tField("chooseArm")}</option>
              {armOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {step === "guardians" ? (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">{t("guardianHint")}</p>
            {guardians.map((g, i) => (
              <fieldset
                key={i}
                className="flex flex-col gap-4 rounded-card border border-border bg-background p-4"
              >
                <legend className="px-1 text-sm font-semibold text-foreground">
                  {tField("guardianN", { n: i + 1 })}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={tField("firstNameG")}
                    required
                    value={g.firstName}
                    onChange={(e) => setGuardian(i, { firstName: e.target.value })}
                  />
                  <Input
                    label={tField("lastNameG")}
                    required
                    value={g.lastName}
                    onChange={(e) => setGuardian(i, { lastName: e.target.value })}
                  />
                  <Input
                    label={tField("phone")}
                    inputMode="tel"
                    required
                    value={g.phone}
                    onChange={(e) => setGuardian(i, { phone: e.target.value })}
                  />
                  <Input
                    label={tField("email")}
                    type="email"
                    value={g.email}
                    onChange={(e) => setGuardian(i, { email: e.target.value })}
                  />
                  <Input
                    label={tField("relationship")}
                    required
                    value={g.relationship}
                    onChange={(e) => setGuardian(i, { relationship: e.target.value })}
                  />
                  <Input
                    label={tField("priority")}
                    inputMode="numeric"
                    value={g.priority}
                    onChange={(e) => setGuardian(i, { priority: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5 accent-brand"
                      checked={g.isPrimaryPayer}
                      onChange={(e) => setGuardian(i, { isPrimaryPayer: e.target.checked })}
                    />
                    {tField("primaryPayer")}
                  </label>
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5 accent-brand"
                      checked={g.isEmergencyContact}
                      onChange={(e) => setGuardian(i, { isEmergencyContact: e.target.checked })}
                    />
                    {tField("emergencyContact")}
                  </label>
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5 accent-brand"
                      checked={g.canPickup}
                      onChange={(e) => setGuardian(i, { canPickup: e.target.checked })}
                    />
                    {tField("canPickup")}
                  </label>
                </div>
                {guardians.length > 1 ? (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      onClick={() => setGuardians((gs) => gs.filter((_, j) => j !== i))}
                    >
                      {tField("removeGuardian", {
                        name:
                          `${g.firstName} ${g.lastName}`.trim() ||
                          tField("guardianN", { n: i + 1 }),
                      })}
                    </Button>
                  </div>
                ) : null}
              </fieldset>
            ))}
            {guardians.length < MAX_GUARDIANS ? (
              <div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setGuardians((gs) => [
                      ...gs,
                      { ...EMPTY_GUARDIAN, priority: String(gs.length + 1) },
                    ])
                  }
                >
                  {tField("addGuardian")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "review" ? (
          <div className="flex flex-col gap-4">
            <CardTitle className="text-base">{t("reviewTitle")}</CardTitle>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-control bg-background px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {tField("firstName")}
                </dt>
                <dd className="text-sm font-medium">
                  {`${draft.firstName} ${draft.middleName} ${draft.lastName}`
                    .replace(/\s+/g, " ")
                    .trim()}
                </dd>
              </div>
              <div className="rounded-control bg-background px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {tField("dateOfBirth")}
                </dt>
                <dd className="text-sm font-medium">{draft.dateOfBirth}</dd>
              </div>
              <div className="rounded-control bg-background px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("guardianCount", { count: guardians.length })}
                </dt>
                <dd className="text-sm font-medium">
                  {guardians.map((g) => `${g.firstName} ${g.lastName}`.trim()).join(", ")}
                </dd>
              </div>
            </dl>
            {candidates !== null ? (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-card border border-warning/40 bg-warning-surface p-4 text-warning-foreground"
              >
                <p className="font-semibold">{t("duplicateTitle")}</p>
                <p className="text-sm">{t("duplicateBody")}</p>
                {candidates.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {candidates.map((id) => (
                      <li key={id}>
                        <Link
                          href={`/students/${id}`}
                          className="text-sm font-semibold underline underline-offset-4"
                        >
                          {t("openCandidate")}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {access.canOverrideDuplicate ? (
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="danger"
                      loading={submitting}
                      loadingLabel={tState("loading")}
                      onClick={() => {
                        // A different request (the override flag), so it gets its own key.
                        const overrideKey = newActionKey();
                        setActionKey(overrideKey);
                        void submit(true, overrideKey);
                      }}
                    >
                      {t("registerAnyway")}
                    </Button>
                    <p className="text-xs">{t("registerAnywayHint")}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {message ? (
              <p role="alert" className="text-sm text-danger-foreground">
                {message}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-between gap-3 border-t border-border/70 pt-5">
          <Button
            variant="ghost"
            onClick={() => {
              if (stepIndex === 0) {
                router.push("/students");
                return;
              }
              // Leaving the review changes the request if the user edits it, so the next submit gets a new key.
              if (step === "review") {
                setCandidates(null);
                setMessage(null);
                setActionKey(newActionKey());
              }
              setStep(STEPS[stepIndex - 1]!);
            }}
          >
            {t("back")}
          </Button>
          {step !== "review" ? (
            <Button onClick={next}>{t("next")}</Button>
          ) : (
            <Button
              onClick={() => void submit(false, actionKey)}
              loading={submitting}
              loadingLabel={tState("loading")}
              disabled={candidates !== null}
            >
              {t("submit")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
