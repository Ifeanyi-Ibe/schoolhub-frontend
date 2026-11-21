"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { refusalText } from "@/features/students/refusal";
import { updateStaff, type StaffView } from "./api";
import { draftFromStaff, lagosToday, staffRequest, type StaffDraft } from "./rules";
import { StaffForm } from "./StaffForm";

/** Edit a staff record. Loaded when the administrator opens it, so the profile page does not ship the form. */
export function EditStaffDialog({ staff, onClose }: { staff: StaffView; onClose: () => void }) {
  const t = useTranslations("staffMembers");
  const tState = useTranslations("academics.state");
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(draft: StaffDraft) {
    setBusy(true);
    setMessage(null);
    try {
      await updateStaff(staff.id, staffRequest(draft));
      await qc.invalidateQueries({ queryKey: ["staff", staff.id] });
      await qc.invalidateQueries({ queryKey: ["staff-list"] });
      toast({ tone: "success", title: t("saved") });
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
      title={t("editTitle")}
      description={t("editIntro")}
    >
      <StaffForm
        initial={draftFromStaff(staff)}
        today={lagosToday()}
        submitLabel={t("save")}
        busy={busy}
        serverMessage={message}
        onSubmit={save}
        onCancel={onClose}
      />
    </Dialog>
  );
}
