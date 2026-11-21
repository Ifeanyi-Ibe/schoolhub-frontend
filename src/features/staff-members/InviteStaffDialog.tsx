"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatCalendarDate } from "@/features/academics/calendar-format";
import { refusalText } from "@/features/students/refusal";
import { rolesQuery } from "@/features/staff/api";
import { inviteStaff } from "./api";
import { inviteProblems, type InviteDraft } from "./rules";

/** Invite the staff member to sign in. The invitation goes to the email or phone; the roles set what they can do. */
export function InviteStaffDialog({
  staffId,
  staffName,
  onClose,
}: {
  staffId: string;
  staffName: string;
  onClose: () => void;
}) {
  const t = useTranslations("staffMembers");
  const tState = useTranslations("academics.state");
  const toast = useToast();
  const roles = useQuery(rolesQuery);
  const [draft, setDraft] = useState<InviteDraft>({ email: "", phone: "", roleNames: [] });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const problems = inviteProblems(draft);

  function toggle(name: string) {
    setDraft((d) => ({
      ...d,
      roleNames: d.roleNames.includes(name)
        ? d.roleNames.filter((r) => r !== name)
        : [...d.roleNames, name],
    }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (problems.length > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const invited = await inviteStaff(staffId, {
        email: draft.email.trim() === "" ? null : draft.email.trim(),
        phone: draft.phone.trim() === "" ? null : draft.phone.trim(),
        roleNames: draft.roleNames,
      });
      toast({ tone: "success", title: t("invited") });
      setMessage(t("invitedDetail", { date: formatCalendarDate(invited.expiresAt.slice(0, 10)) }));
      setBusy(false);
    } catch (err) {
      setMessage(refusalText(err, tState));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("inviteTitle", { name: staffName })}
      description={t("inviteIntro")}
    >
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <Input
          label={t("invite.email")}
          type="email"
          autoComplete="email"
          value={draft.email}
          onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
          error={tried && problems.includes("email") ? t("errors.email") : undefined}
        />
        <Input
          label={t("invite.phone")}
          type="tel"
          autoComplete="tel"
          value={draft.phone}
          onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
          error={tried && problems.includes("phone") ? t("errors.phone") : undefined}
          hint={t("invite.contactHint")}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-foreground">{t("invite.roles")}</legend>
          {roles.isPending ? (
            <p className="text-sm text-muted-foreground">{tState("loading")}</p>
          ) : roles.isError ? (
            <p role="alert" className="text-sm text-danger-foreground">
              {tState("errorBody")}
            </p>
          ) : (
            (roles.data ?? []).map((r) => (
              <label
                key={r.id}
                className="flex min-h-11 items-center gap-3 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  className="size-5 accent-brand"
                  checked={draft.roleNames.includes(r.name)}
                  onChange={() => toggle(r.name)}
                />
                {r.name}
              </label>
            ))
          )}
          {tried && problems.includes("roleRequired") ? (
            <p role="alert" className="text-sm text-danger-foreground">
              {t("errors.roleRequired")}
            </p>
          ) : null}
        </fieldset>
        {tried && problems.includes("contactRequired") ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {t("errors.contactRequired")}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="text-sm text-foreground">
            {message}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("close")}
          </Button>
          <Button type="submit" loading={busy} loadingLabel={t("saving")}>
            {t("sendInvite")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
