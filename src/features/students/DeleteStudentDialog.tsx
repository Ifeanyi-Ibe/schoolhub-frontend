"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { deleteStudent, type StudentView } from "./api";
import { refusalText } from "./refusal";

/** Confirms the delete. Loaded only when the administrator asks to delete, so the record page does not ship it. */
export function DeleteStudentDialog({
  student: s,
  onClose,
}: {
  student: StudentView;
  onClose: () => void;
}) {
  const t = useTranslations("students.profile");
  const tState = useTranslations("academics.state");
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("delete")}
      description={t("deleteBody")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tState("cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              setMessage(null);
              try {
                await deleteStudent(s.id);
                await qc.invalidateQueries({ queryKey: ["students"] });
                toast({ tone: "success", title: tState("deleted") });
                router.replace("/students");
              } catch (err) {
                setMessage(refusalText(err, tState));
              }
            }}
          >
            {t("deleteConfirm")}
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
