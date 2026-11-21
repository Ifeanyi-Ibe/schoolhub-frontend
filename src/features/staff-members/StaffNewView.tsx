"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonList } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { refusalText } from "@/features/students/refusal";
import { useStaffAccess } from "./access";
import { createStaff } from "./api";
import { EMPTY_STAFF_DRAFT, lagosToday, staffRequest, type StaffDraft } from "./rules";
import { StaffForm } from "./StaffForm";

/** Create a staff record. The API decides the rest; the form checks what the contract requires. */
export function StaffNewView() {
  const t = useTranslations("staffMembers");
  const tState = useTranslations("academics.state");
  const access = useStaffAccess();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (access.loading) return <SkeletonList rows={4} label={tState("loading")} />;
  if (!access.writable)
    return <EmptyState title={t("noWriteTitle")} description={t("noWriteBody")} />;

  async function save(draft: StaffDraft) {
    setBusy(true);
    setMessage(null);
    try {
      const created = await createStaff(staffRequest(draft));
      await qc.invalidateQueries({ queryKey: ["staff-list"] });
      toast({ tone: "success", title: t("created") });
      router.replace(`/staff/${created.id}`);
    } catch (err) {
      setMessage(refusalText(err, tState));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("newTitle")} description={t("newIntro")} />
      <Card>
        <StaffForm
          initial={EMPTY_STAFF_DRAFT}
          today={lagosToday()}
          submitLabel={t("create")}
          busy={busy}
          serverMessage={message}
          onSubmit={save}
          onCancel={() => router.push("/staff")}
        />
      </Card>
    </div>
  );
}
