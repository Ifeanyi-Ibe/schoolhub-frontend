"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatCalendarDate } from "@/features/academics/calendar-format";
import { refusalText } from "@/features/students/refusal";
import { decideLeave, requestLeave, staffLeaveQuery, type LeaveView } from "./api";
import { isPendingLeave, leaveProblems, LEAVE_TYPE_MAX, type LeaveDraft } from "./rules";
import { useStaffAccess } from "./access";

const EMPTY_LEAVE: LeaveDraft = { leaveType: "", startsOn: "", endsOn: "" };

/**
 * Leave for one staff member. A request is pending until the API records a decision time; the approve and reject
 * buttons appear only on pending requests and only for holders of the assign permission. Nothing here is
 * optimistic: the list changes when the API has answered.
 */
export function LeavePanel({ staffId }: { staffId: string }) {
  const t = useTranslations("staffMembers");
  const tState = useTranslations("academics.state");
  const access = useStaffAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const leave = useQuery(staffLeaveQuery(staffId));
  const [draft, setDraft] = useState<LeaveDraft>(EMPTY_LEAVE);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (access.loading || leave.isPending) return <SkeletonList rows={3} label={tState("loading")} />;
  if (leave.isError)
    return (
      <p role="alert" className="text-sm text-danger-foreground">
        {tState("errorBody")}
      </p>
    );

  const problems = leaveProblems(draft);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["staff-leave", staffId] });
    await qc.invalidateQueries({ queryKey: ["staff", staffId] });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (problems.length > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      await requestLeave(staffId, {
        leaveType: draft.leaveType.trim(),
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
      });
      await refresh();
      setDraft(EMPTY_LEAVE);
      setTried(false);
      toast({ tone: "success", title: t("leave.requested") });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  async function decide(item: LeaveView, decision: "approve" | "reject") {
    setBusy(true);
    setMessage(null);
    try {
      await decideLeave(item.id, decision);
      await refresh();
      toast({
        tone: "success",
        title: decision === "approve" ? t("leave.approved") : t("leave.rejected"),
      });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  const items = leave.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <CardTitle>{t("leave.title")}</CardTitle>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("leave.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const pending = isPendingLeave(item.decidedAt);
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 rounded-control border border-border/80 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{item.leaveType}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCalendarDate(item.startsOn)} – {formatCalendarDate(item.endsOn)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge tone={pending ? "warning" : "neutral"}>
                      {pending ? t("leave.pending") : t("leave.decided")}
                    </StatusBadge>
                    {pending && access.canAssign ? (
                      <>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => decide(item, "approve")}
                        >
                          {t("leave.approve")}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => decide(item, "reject")}
                        >
                          {t("leave.reject")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {message ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {message}
          </p>
        ) : null}
      </Card>

      {access.writable ? (
        <Card>
          <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
            <CardTitle>{t("leave.request")}</CardTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label={t("leave.type")}
                value={draft.leaveType}
                onChange={(e) => setDraft((d) => ({ ...d, leaveType: e.target.value }))}
                error={
                  tried && problems.includes("leaveTypeRequired")
                    ? t("errors.leaveTypeRequired")
                    : tried && problems.includes("leaveTypeLength")
                      ? t("errors.leaveTypeLength")
                      : undefined
                }
                maxLength={LEAVE_TYPE_MAX}
                required
              />
              <Input
                label={t("leave.startsOn")}
                type="date"
                value={draft.startsOn}
                onChange={(e) => setDraft((d) => ({ ...d, startsOn: e.target.value }))}
                error={tried && problems.includes("startsOn") ? t("errors.startsOn") : undefined}
                required
              />
              <Input
                label={t("leave.endsOn")}
                type="date"
                value={draft.endsOn}
                onChange={(e) => setDraft((d) => ({ ...d, endsOn: e.target.value }))}
                error={
                  tried && problems.includes("endsOn")
                    ? t("errors.endsOn")
                    : tried && problems.includes("endsBeforeStart")
                      ? t("errors.endsBeforeStart")
                      : undefined
                }
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={busy} loadingLabel={t("saving")}>
                {t("leave.submit")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
