"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/unwrap";
import { createSubject, deleteSubject, updateSubject, type Subject } from "./catalogue-api";
import { SUBJECT_CATEGORIES, subjectProblems, type SubjectDraft } from "./catalogue-rules";

/** Adds a subject, or edits one. Every field is checked before the request; a refusal shows its code. */
export function SubjectDialog({
  subject,
  onOpenChange,
}: {
  subject: Subject | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("academics.subjects");
  const tState = useTranslations("academics.state");
  const tRules = useTranslations("academics.rules");
  const tCat = useTranslations("academics.category");
  const toast = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<SubjectDraft>({
    defaultValues: {
      code: subject?.code ?? "",
      name: subject?.name ?? "",
      category: subject?.category ?? "Core",
    },
  });
  const fieldError = (field: keyof SubjectDraft) => {
    const problem = subjectProblems(form.getValues()).find((p) => p.startsWith(`subject.${field}`));
    return form.formState.submitCount > 0 && problem ? tRules(problem) : undefined;
  };

  async function onSubmit(v: SubjectDraft) {
    setMessage(null);
    const problems = subjectProblems(v);
    if (problems.length > 0) return;
    const input = { code: v.code.trim(), name: v.name.trim(), category: v.category };
    try {
      if (subject) await updateSubject(subject.id, input);
      else await createSubject(input);
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["subjects"] });
      onOpenChange(false);
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      setMessage(
        problem?.status === 403
          ? tState("forbidden")
          : tState("refused", { code: problem?.code ?? "unknown" }),
      );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={subject ? t("dialogEdit") : t("dialogAdd")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tState("cancel")}
          </Button>
          <Button
            type="submit"
            form="subject-form"
            loading={form.formState.isSubmitting}
            loadingLabel={tState("loading")}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <form
        id="subject-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <Input
          label={t("code")}
          autoComplete="off"
          error={fieldError("code")}
          {...form.register("code", { onChange: () => setMessage(null) })}
        />
        <Input label={t("name")} error={fieldError("name")} {...form.register("name")} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="subject-category" className="text-sm font-medium text-foreground">
            {t("category")}
          </label>
          <select
            id="subject-category"
            className="min-h-11 w-full rounded-control border border-input-border bg-surface px-3 text-base text-foreground"
            aria-invalid={fieldError("category") ? true : undefined}
            {...form.register("category")}
          >
            {SUBJECT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tCat(c)}
              </option>
            ))}
          </select>
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

/** Confirms, then deletes a subject. The server decides whether it can go (class mappings may use it). */
export function DeleteSubjectDialog({
  subject,
  onOpenChange,
}: {
  subject: Subject;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("academics.subjects");
  const tState = useTranslations("academics.state");
  const toast = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setMessage(null);
    try {
      await deleteSubject(subject.id);
      toast({ tone: "success", title: tState("deleted") });
      await qc.invalidateQueries({ queryKey: ["subjects"] });
      onOpenChange(false);
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      setMessage(
        problem?.status === 403
          ? tState("forbidden")
          : tState("refused", { code: problem?.code ?? "unknown" }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t("delete")}
      description={t("confirmDelete", { name: subject.name })}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tState("cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={confirm}
            loading={busy}
            loadingLabel={tState("loading")}
          >
            {t("delete")}
          </Button>
        </>
      }
    >
      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
    </Dialog>
  );
}
