"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { academicSessionsQuery } from "@/features/academics/sessions-api";
import { subjectsQuery } from "@/features/academics/catalogue-api";
import { refusalText } from "@/features/students/refusal";
import { useArmOptions } from "@/features/students/arms";
import { saveStaffAssignments, staffAssignmentsQuery } from "./api";
import { assignmentProblems, assignmentRequest, type AssignmentDraft } from "./rules";
import { useStaffAccess } from "./access";

/**
 * The staff member's class and subject assignments in one session. Saving replaces the session's rows, so the
 * panel sends every row. The form teacher rule is checked here and again by the API across the whole session.
 */
export function AssignmentsPanel({ staffId }: { staffId: string }) {
  const t = useTranslations("staffMembers");
  const tState = useTranslations("academics.state");
  const access = useStaffAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const sessions = useQuery(academicSessionsQuery);
  const [chosen, setChosen] = useState("");
  const sessionId =
    chosen !== ""
      ? chosen
      : (sessions.data?.find((s) => s.isCurrent)?.id ?? sessions.data?.[0]?.id ?? "");
  const assignments = useQuery({
    ...staffAssignmentsQuery(staffId, sessionId),
    enabled: access.canAssignRead && sessionId !== "",
  });
  const arms = useArmOptions(access.canAssignRead);
  const subjects = useQuery({ ...subjectsQuery, enabled: access.canAssignRead });
  const [rows, setRows] = useState<AssignmentDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  if (access.loading) return <SkeletonList rows={3} label={tState("loading")} />;
  if (!access.canAssignRead)
    return (
      <EmptyState
        title={t("assignments.noAccessTitle")}
        description={t("assignments.noAccessBody")}
      />
    );

  const serverRows: AssignmentDraft[] = (assignments.data ?? []).map((a) => ({
    classArmId: a.classArmId,
    subjectId: a.subjectId ?? "",
    isFormTeacher: a.isFormTeacher,
  }));
  const current = rows ?? serverRows;
  const armLabel = (id: string) =>
    arms.find((a) => a.id === id)?.label ?? t("assignments.armUnknown");
  const subjectName = (id: string) =>
    (subjects.data ?? []).find((s) => s.id === id)?.name ?? t("assignments.subjectUnknown");

  function update(index: number, patch: Partial<AssignmentDraft>) {
    setRows(current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function save() {
    const found = assignmentProblems(current);
    setProblems(found);
    if (found.length > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveStaffAssignments(staffId, sessionId, assignmentRequest(current));
      await qc.invalidateQueries({ queryKey: ["staff-assignments", staffId, sessionId] });
      await qc.invalidateQueries({ queryKey: ["arm-teachers"] });
      setRows(null);
      toast({ tone: "success", title: t("assignments.saved") });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <CardTitle>{t("assignments.title")}</CardTitle>
        <div className="w-full sm:w-64">
          <Select
            label={t("assignments.session")}
            value={sessionId}
            onChange={(e) => {
              setChosen(e.target.value);
              setRows(null);
            }}
          >
            {(sessions.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {arms.length === 0 && access.canAssignRead ? (
        <p className="text-sm text-muted-foreground">{t("assignments.armsUnavailable")}</p>
      ) : null}

      {assignments.isPending && sessionId !== "" ? (
        <SkeletonList rows={2} label={tState("loading")} />
      ) : current.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("assignments.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {current.map((r, i) => (
            <li
              key={`${r.classArmId}-${r.subjectId}-${i}`}
              className="flex flex-col gap-3 rounded-control border border-border/80 p-4 sm:flex-row sm:items-end"
            >
              {access.writable ? (
                <>
                  <div className="min-w-0 flex-1">
                    <Select
                      label={t("assignments.arm")}
                      value={r.classArmId}
                      onChange={(e) => update(i, { classArmId: e.target.value })}
                    >
                      <option value="">{t("assignments.choose")}</option>
                      {arms.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Select
                      label={t("assignments.subject")}
                      value={r.subjectId}
                      onChange={(e) => update(i, { subjectId: e.target.value })}
                    >
                      <option value="">{t("assignments.allSubjects")}</option>
                      {(subjects.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="size-5 accent-brand"
                      checked={r.isFormTeacher}
                      onChange={(e) => update(i, { isFormTeacher: e.target.checked })}
                    />
                    {t("assignments.formTeacher")}
                  </label>
                  <Button
                    variant="ghost"
                    onClick={() => setRows(current.filter((_, j) => j !== i))}
                  >
                    {t("assignments.remove")}
                  </Button>
                </>
              ) : (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  <p className="text-sm font-semibold text-foreground">{armLabel(r.classArmId)}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.subjectId === "" ? t("assignments.allSubjects") : subjectName(r.subjectId)}
                  </p>
                  {r.isFormTeacher ? (
                    <StatusBadge tone="info">{t("assignments.formTeacher")}</StatusBadge>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {problems.length > 0 ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {problems.map((p) => t(`assignments.errors.${p}`)).join(" ")}
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}

      {access.writable && sessionId !== "" ? (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button
            variant="secondary"
            disabled={busy || arms.length === 0}
            onClick={() =>
              setRows([...current, { classArmId: "", subjectId: "", isFormTeacher: false }])
            }
          >
            {t("assignments.add")}
          </Button>
          <Button
            onClick={save}
            loading={busy}
            loadingLabel={tState("loading")}
            disabled={rows === null}
          >
            {t("assignments.save")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
