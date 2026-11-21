"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { refusalText } from "@/features/students/refusal";
import { deactivateStaff, type StaffView } from "./api";

/** Asks before a staff record is deactivated. Loaded only when the administrator asks, so the record page does not ship the dialog. */
export function DeactivateStaffDialog({
  staff,
  onClose,
}: {
  staff: StaffView;
  onClose: () => void;
}) {
  const t = useTranslations("staffMembers");
  const tState = useTranslations("academics.state");
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      await deactivateStaff(staff.id);
      await qc.invalidateQueries({ queryKey: ["staff", staff.id] });
      await qc.invalidateQueries({ queryKey: ["staff-list"] });
      toast({ tone: "success", title: t("status.deactivated") });
      onClose();
    } catch (err) {
      setMessage(refusalText(err, tState));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("status.confirmTitle", { name: staff.firstName })}
      description={t("status.confirmBody")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tState("cancel")}
          </Button>
          <Button variant="danger" onClick={run} loading={busy} loadingLabel={tState("loading")}>
            {t("status.confirm")}
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
