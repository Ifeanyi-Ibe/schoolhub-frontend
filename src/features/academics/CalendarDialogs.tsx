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
import { createCalendarDay, deleteCalendarDay, type CalendarDay } from "./catalogue-api";
import { CALENDAR_DAY_TYPES, calendarProblems, type CalendarDraft } from "./catalogue-rules";
import { formatCalendarDate } from "./calendar-format";

/** Adds a non-school day, a holiday or a special event. Every field is checked before the request. */
export function AddCalendarDayDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("academics.calendar");
  const tState = useTranslations("academics.state");
  const tRules = useTranslations("academics.rules");
  const tType = useTranslations("academics.calendar.types");
  const toast = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<CalendarDraft>({ defaultValues: { date: "", type: "Holiday", name: "" } });
  const fieldError = (field: keyof CalendarDraft) => {
    if (form.formState.submitCount === 0) return undefined;
    const problem = calendarProblems(form.getValues()).find((p) =>
      p.startsWith(`calendar.${field}`),
    );
    return problem ? tRules(problem) : undefined;
  };

  async function onSubmit(v: CalendarDraft) {
    setMessage(null);
    if (calendarProblems(v).length > 0) return;
    try {
      await createCalendarDay({ date: v.date.trim(), type: v.type, name: v.name.trim() });
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["calendar-days"] });
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
      title={t("add")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tState("cancel")}
          </Button>
          <Button
            type="submit"
            form="calendar-day-form"
            loading={form.formState.isSubmitting}
            loadingLabel={tState("loading")}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <form
        id="calendar-day-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <Input
          label={t("date")}
          type="date"
          error={fieldError("date")}
          {...form.register("date")}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="calendar-type" className="text-sm font-medium text-foreground">
            {t("type")}
          </label>
          <select
            id="calendar-type"
            className="min-h-11 w-full rounded-control border border-input-border bg-surface px-3 text-base text-foreground"
            {...form.register("type")}
          >
            {CALENDAR_DAY_TYPES.map((c) => (
              <option key={c} value={c}>
                {tType(c)}
              </option>
            ))}
          </select>
        </div>
        <Input label={t("name")} error={fieldError("name")} {...form.register("name")} />
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

/** Confirms, then deletes one calendar day. */
export function ConfirmDeleteDayDialog({
  day,
  onOpenChange,
}: {
  day: CalendarDay;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("academics.calendar");
  const tState = useTranslations("academics.state");
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setMessage(null);
    try {
      await deleteCalendarDay(day.id);
      toast({ tone: "success", title: tState("deleted") });
      await qc.invalidateQueries({ queryKey: ["calendar-days"] });
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
      description={t("confirmDelete", { name: day.name, date: formatCalendarDate(day.date) })}
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
