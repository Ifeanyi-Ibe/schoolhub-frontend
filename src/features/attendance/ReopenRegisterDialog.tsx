"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { refusalText } from "@/features/students/refusal";
import { reopenRegister } from "./api";

/** Reopens a locked register. The reason is required: the server records it in the audit trail (attendance.edit.past). */
export function ReopenRegisterDialog({
  classArmId,
  date,
  onClose,
  onDone,
}: {
  classArmId: string;
  date: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useTranslations("attendance");
  const tState = useTranslations("academics.state");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const missing = reason.trim() === "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (missing) return;
    setBusy(true);
    setMessage(null);
    try {
      await reopenRegister(classArmId, date, null, reason.trim());
      await onDone();
    } catch (err) {
      setMessage(refusalText(err, tState));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("reopen.title")}
      description={t("reopen.body")}
    >
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <Input
          label={t("reopen.reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          error={tried && missing ? t("reopen.reasonRequired") : undefined}
          required
        />
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tState("cancel")}
          </Button>
          <Button type="submit" loading={busy} loadingLabel={tState("loading")}>
            {t("reopen.confirm")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
