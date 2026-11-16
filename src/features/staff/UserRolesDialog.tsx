"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { components } from "@/lib/api/schema";
import { ApiError } from "@/lib/api/unwrap";
import { removalCostsOwnStaffAccess, setUserRoles } from "./user-roles";

type Person = components["schemas"]["UserView"];
type Role = components["schemas"]["RoleView"];

/**
 * Removes roles from one person. The roles a person holds are listed by name in GET /users; they are
 * matched to the role list (GET /roles) to get their ids. Unticked roles are removed on save.
 */
export function UserRolesDialog({
  person,
  roles,
  mine,
  isSelf,
  onOpenChange,
}: {
  person: Person;
  roles: readonly Role[];
  mine: readonly string[];
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("staff.userRoles");
  const toast = useToast();
  const qc = useQueryClient();
  const held = roles.filter((r) => person.roles.includes(r.name));
  const [kept, setKept] = useState<string[]>(() => held.map((r) => r.id));
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const removed = held.map((r) => r.id).filter((id) => !kept.includes(id));
  const warn = removalCostsOwnStaffAccess(removed, roles, mine, isSelf);
  const canSave = removed.length > 0 && (!warn || confirmed) && !saving;

  async function save() {
    setMessage(null);
    setSaving(true);
    try {
      await setUserRoles(person.id, kept);
      toast({ tone: "success", title: t("saved") });
      await qc.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
    } catch (err) {
      const problem = err instanceof ApiError ? err.problem : null;
      if (problem?.status === 403) setMessage(t("forbidden"));
      else if (problem?.code) setMessage(t("refused", { code: problem.code }));
      else setMessage(t("refused", { code: "unknown" }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t("title", { name: person.displayName })}
      description={t("description")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => void save()}
            disabled={!canSave}
            loading={saving}
            loadingLabel={t("saving")}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t("current")}</legend>
          {held.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            held.map((r) => (
              <label key={r.id} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={kept.includes(r.id)}
                  onChange={(e) =>
                    setKept((prev) =>
                      e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                    )
                  }
                />
                <span>{r.name}</span>
              </label>
            ))
          )}
        </fieldset>
        {warn ? (
          <div className="flex flex-col gap-2 rounded-control border border-warning-foreground/30 bg-warning-surface p-3">
            <p role="status" className="text-sm text-warning-foreground">
              {t("ownWarning")}
            </p>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {t("confirmOwn")}
            </label>
          </div>
        ) : null}
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
