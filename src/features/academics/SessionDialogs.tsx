"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { newActionKey } from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/unwrap";
import {
  isIsoDate,
  sessionProblems,
  termProblems,
  type SessionDraft,
  type TermDraft,
} from "./catalogue-rules";
import {
  archiveAcademicSession,
  createAcademicSession,
  createTerm,
  rolloverToSession,
  updateAcademicSession,
  updateTerm,
  type AcademicSession,
  type Term,
} from "./sessions-api";

function refusalText(
  err: unknown,
  tState: (key: string, values?: Record<string, string>) => string,
): string {
  const problem = err instanceof ApiError ? err.problem : null;
  return problem?.status === 403
    ? tState("forbidden")
    : tState("refused", { code: problem?.code ?? "unknown" });
}

/** Adds a school year, or edits one. Every field is checked before the request; a refusal shows its code. */
export function SessionDialog({
  session,
  onOpenChange,
}: {
  session: AcademicSession | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("academics.sessions");
  const tState = useTranslations("academics.state");
  const tRules = useTranslations("academics.rules");
  const toast = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<SessionDraft>({
    defaultValues: {
      name: session?.name ?? "",
      startsOn: session?.startsOn ?? "",
      endsOn: session?.endsOn ?? "",
    },
  });
  const fieldError = (field: keyof SessionDraft) => {
    if (form.formState.submitCount === 0) return undefined;
    const codes: Record<keyof SessionDraft, string[]> = {
      name: ["session.name"],
      startsOn: ["session.start"],
      endsOn: ["session.end", "session.order"],
    };
    const hit = sessionProblems(form.getValues()).find((p) => codes[field].includes(p));
    return hit ? tRules(hit) : undefined;
  };

  async function onSubmit(v: SessionDraft) {
    setMessage(null);
    if (sessionProblems(v).length > 0) return;
    const input = { name: v.name.trim(), startsOn: v.startsOn.trim(), endsOn: v.endsOn.trim() };
    try {
      if (session) await updateAcademicSession(session.id, input);
      else await createAcademicSession(input);
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["academic-sessions"] });
      onOpenChange(false);
    } catch (err) {
      setMessage(refusalText(err, tState));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={session ? t("dialogEdit") : t("dialogNew")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tState("cancel")}
          </Button>
          <Button
            type="submit"
            form="session-form"
            loading={form.formState.isSubmitting}
            loadingLabel={tState("loading")}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <form
        id="session-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <Input label={t("columns.name")} error={fieldError("name")} {...form.register("name")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t("start")}
            type="date"
            error={fieldError("startsOn")}
            {...form.register("startsOn")}
          />
          <Input
            label={t("end")}
            type="date"
            error={fieldError("endsOn")}
            {...form.register("endsOn")}
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

/** Adds a term to a session, or edits one. The "next term begins" date is optional. */
export function TermDialog({
  sessionId,
  term,
  onOpenChange,
}: {
  sessionId: string;
  term: Term | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("academics.sessions");
  const tState = useTranslations("academics.state");
  const tRules = useTranslations("academics.rules");
  const toast = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<TermDraft & { nextTermBegins: string }>({
    defaultValues: {
      number: term ? String(term.number) : "",
      name: term?.name ?? "",
      startsOn: term?.startsOn ?? "",
      endsOn: term?.endsOn ?? "",
      nextTermBegins: term?.nextTermBegins ?? "",
    },
  });
  const current = form.getValues();
  const problems = termProblems(current);
  const fieldError = (field: "number" | "name" | "startsOn" | "endsOn") => {
    if (form.formState.submitCount === 0) return undefined;
    const map: Record<string, string> = {
      number: "term.number",
      name: "term.name",
      startsOn: "term.start",
      endsOn: "term.end",
    };
    const hit = problems.find(
      (p) => p === map[field] || (field === "endsOn" && p === "term.order"),
    );
    return hit ? tRules(hit) : undefined;
  };

  async function onSubmit(v: TermDraft & { nextTermBegins: string }) {
    setMessage(null);
    if (termProblems(v).length > 0) return;
    if (v.nextTermBegins.trim() !== "" && !isIsoDate(v.nextTermBegins)) {
      setMessage(tRules("term.end"));
      return;
    }
    const input = {
      number: Number(v.number.trim()),
      name: v.name.trim(),
      startsOn: v.startsOn.trim(),
      endsOn: v.endsOn.trim(),
      nextTermBegins: v.nextTermBegins.trim() === "" ? null : v.nextTermBegins.trim(),
    };
    try {
      if (term) await updateTerm(term.id, input);
      else await createTerm(sessionId, input);
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["session-terms", sessionId] });
      onOpenChange(false);
    } catch (err) {
      setMessage(refusalText(err, tState));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={term ? t("termDialogEdit") : t("termDialogNew")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tState("cancel")}
          </Button>
          <Button
            type="submit"
            form="term-form"
            loading={form.formState.isSubmitting}
            loadingLabel={tState("loading")}
          >
            {t("termSave")}
          </Button>
        </>
      }
    >
      <form
        id="term-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <Input
            label={t("termColumns.number")}
            inputMode="numeric"
            error={fieldError("number")}
            {...form.register("number")}
          />
          <Input
            label={t("termColumns.name")}
            error={fieldError("name")}
            {...form.register("name")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t("start")}
            type="date"
            error={fieldError("startsOn")}
            {...form.register("startsOn")}
          />
          <Input
            label={t("end")}
            type="date"
            error={fieldError("endsOn")}
            {...form.register("endsOn")}
          />
        </div>
        <Input label={t("termColumns.nextTerm")} type="date" {...form.register("nextTermBegins")} />
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

/**
 * Starts a new session. The contract declares Idempotency-Key for this operation: one key is made when the
 * dialog opens and reused on every retry, so a repeated click cannot start two sessions. Nothing changes on
 * screen until the backend answers.
 */
export function RolloverDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("academics.sessions");
  const tState = useTranslations("academics.state");
  const tRules = useTranslations("academics.rules");
  const toast = useToast();
  const qc = useQueryClient();
  const [actionKey] = useState(() => newActionKey());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<SessionDraft>({ defaultValues: { name: "", startsOn: "", endsOn: "" } });

  async function onSubmit(v: SessionDraft) {
    setMessage(null);
    if (sessionProblems(v).length > 0) {
      setMessage(
        sessionProblems(v)
          .map((p) => tRules(p))
          .join(" "),
      );
      return;
    }
    setPending(true);
    try {
      const created = await rolloverToSession(
        { name: v.name.trim(), startsOn: v.startsOn.trim(), endsOn: v.endsOn.trim() },
        actionKey,
      );
      toast({ tone: "success", title: t("rolloverDone", { name: created.name }) });
      await qc.invalidateQueries({ queryKey: ["academic-sessions"] });
      onOpenChange(false);
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open);
      }}
      title={t("rolloverTitle")}
      description={t("rolloverBody")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {tState("cancel")}
          </Button>
          <Button
            type="submit"
            form="rollover-form"
            loading={pending}
            loadingLabel={t("rolloverPending")}
          >
            {t("rolloverAction")}
          </Button>
        </>
      }
    >
      <form
        id="rollover-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <Input label={t("columns.name")} {...form.register("name")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t("start")} type="date" {...form.register("startsOn")} />
          <Input label={t("end")} type="date" {...form.register("endsOn")} />
        </div>
        {pending ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("rolloverPending")}
          </p>
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

/** Confirms, then archives a session. An archived session is kept as history. */
export function ArchiveSessionDialog({
  session,
  onOpenChange,
}: {
  session: AcademicSession;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("academics.sessions");
  const tState = useTranslations("academics.state");
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setMessage(null);
    try {
      await archiveAcademicSession(session.id);
      toast({ tone: "success", title: tState("saved") });
      await qc.invalidateQueries({ queryKey: ["academic-sessions"] });
      onOpenChange(false);
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t("archive")}
      description={t("confirmArchive", { name: session.name })}
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
            {t("archive")}
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
