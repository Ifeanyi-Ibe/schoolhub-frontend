"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { components } from "@/lib/api/schema";
import { ApiError } from "@/lib/api/unwrap";
import { createArm, createLevel, updateLevel } from "./api";
import {
  CLASS_SECTIONS,
  isClassSection,
  armFieldProblem,
  levelFieldProblem,
  type ArmDraft,
  type LevelDraft,
} from "./rules";

type Level = components["schemas"]["LevelView"];

/** Adds a level, or edits one. A refusal is shown with the backend's code. */
export function LevelDialog({
  level,
  onOpenChange,
}: {
  level: Level | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("academics.levelDialog");
  const toast = useToast();
  const qc = useQueryClient();
  const form = useForm<LevelDraft>({
    defaultValues: {
      code: level?.code ?? "",
      name: level?.name ?? "",
      order: level ? String(level.order) : "",
      section: level?.section ?? "",
    },
  });
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(v: LevelDraft) {
    setMessage(null);
    const section = v.section.trim();
    if (!isClassSection(section)) return;
    const input = {
      code: v.code.trim(),
      name: v.name.trim(),
      order: Number(v.order.trim()),
      section,
    };
    try {
      if (level) await updateLevel(level.id, input);
      else await createLevel(input);
      toast({ tone: "success", title: t("saved") });
      await qc.invalidateQueries({ queryKey: ["class-levels"] });
      onOpenChange(false);
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      if (problem?.status === 403) setMessage(t("forbidden"));
      else if (problem?.code) setMessage(t("refused", { code: problem.code }));
      else setMessage(t("failed"));
    }
  }

  const check = (field: keyof LevelDraft) => (_value: string, draft: LevelDraft) => {
    const problem = levelFieldProblem(field, draft);
    return problem === null ? true : t(problem);
  };

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={level ? t("editTitle") : t("addTitle")}
      description={t("description")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="level-form"
            loading={form.formState.isSubmitting}
            loadingLabel={t("saving")}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form
        id="level-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <Input
          label={t("code")}
          required
          error={form.formState.errors.code?.message}
          {...form.register("code", { validate: check("code") })}
        />
        <Input
          label={t("name")}
          required
          error={form.formState.errors.name?.message}
          {...form.register("name", { validate: check("name") })}
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("section")}
          <select
            required
            aria-invalid={form.formState.errors.section ? true : undefined}
            className="min-h-11 rounded-control border border-input-border bg-surface px-3 text-base"
            {...form.register("section", { validate: check("section") })}
          >
            <option value="">{t("sectionChoose")}</option>
            {CLASS_SECTIONS.map((value) => (
              <option key={value} value={value}>
                {t(`sections.${value}`)}
              </option>
            ))}
          </select>
          {form.formState.errors.section ? (
            <span role="alert" className="text-sm font-medium text-danger">
              {form.formState.errors.section.message}
            </span>
          ) : null}
        </label>
        <Input
          label={t("order")}
          inputMode="numeric"
          required
          error={form.formState.errors.order?.message}
          {...form.register("order", { validate: check("order") })}
        />
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

/** Adds an arm to a level. The form teacher is assigned later, when the staff screens exist. */
export function ArmDialog({
  levelId,
  levelName,
  onOpenChange,
}: {
  levelId: string;
  levelName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("academics.armDialog");
  const toast = useToast();
  const qc = useQueryClient();
  const form = useForm<ArmDraft>({ defaultValues: { name: "", capacity: "" } });
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(v: ArmDraft) {
    setMessage(null);
    try {
      await createArm(levelId, {
        name: v.name.trim(),
        capacity: Number(v.capacity.trim()),
        formTeacherStaffId: null,
      });
      toast({ tone: "success", title: t("added") });
      await qc.invalidateQueries({ queryKey: ["class-level-arms", levelId] });
      onOpenChange(false);
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      if (problem?.status === 403) setMessage(t("forbidden"));
      else if (problem?.code) setMessage(t("refused", { code: problem.code }));
      else setMessage(t("failed"));
    }
  }

  const check = (field: keyof ArmDraft) => (_value: string, draft: ArmDraft) => {
    const problem = armFieldProblem(field, draft);
    return problem === null ? true : t(problem);
  };

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t("title", { level: levelName })}
      description={t("description")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="arm-form"
            loading={form.formState.isSubmitting}
            loadingLabel={t("saving")}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form
        id="arm-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <Input
          label={t("name")}
          required
          error={form.formState.errors.name?.message}
          {...form.register("name", { validate: check("name") })}
        />
        <Input
          label={t("capacity")}
          inputMode="numeric"
          required
          error={form.formState.errors.capacity?.message}
          {...form.register("capacity", { validate: check("capacity") })}
        />
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
