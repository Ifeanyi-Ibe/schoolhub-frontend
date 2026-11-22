"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatCalendarDate } from "@/features/academics/calendar-format";
import { isIsoDate } from "@/features/students/rules";
import { lagosToday } from "@/features/staff-members/rules";
import { refusalText } from "@/features/students/refusal";
import { ApiError } from "@/lib/api/unwrap";
import { useAttendanceAccess } from "./access";
import { registerQuery, submitRegister } from "./api";
import {
  ATTENDANCE_STATUSES,
  arrivalProblem,
  queuedMarks,
  type AttendanceStatus,
  type MarkDraft,
  type RegisterKey,
} from "./rules";
import { useOfflineRegister, useSyncOnReturn } from "./offline/engine";

const ReopenRegisterDialog = lazy(() =>
  import("./ReopenRegisterDialog").then((m) => ({ default: m.ReopenRegisterDialog })),
);

const STATUS_TONE: Record<AttendanceStatus, StatusTone> = {
  Present: "success",
  Absent: "danger",
  Late: "warning",
  Excused: "info",
};

function isStatus(value: string | null | undefined): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value ?? "");
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * One class arm's register for one day. Online, it shows the names and the saved marks. Offline, it shows the rows
 * in the server's order (no names are kept on the device, ADR 0017) and saves the marks to the queue.
 */
export function RegisterView() {
  const t = useTranslations("attendance");
  const tState = useTranslations("academics.state");
  const params = useSearchParams();
  const classArmId = params.get("classArmId") ?? "";
  const date = params.get("date") ?? lagosToday();
  const armLabel = params.get("arm") ?? t("register.armFallback");
  const access = useAttendanceAccess();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const key: RegisterKey | null = useMemo(
    () => (classArmId !== "" && isIsoDate(date) ? { classArmId, date, period: null } : null),
    [classArmId, date],
  );
  const reg = useQuery({
    ...registerQuery(classArmId, date, null),
    enabled: access.canReadMark && key !== null && online,
    retry: false,
  });
  // Offline, the last online answer is not used: the rows fall back to the device's roster order.
  const data = online ? reg.data : undefined;
  const offline = useOfflineRegister(key);
  // The teacher's unsaved edits. Everything else is derived: the server's marks, then the queued marks on top.
  const [edits, setEdits] = useState<Record<string, Partial<MarkDraft>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  // Keep the student order on the device whenever the server has answered (so the register can be marked offline).
  // The roster is written once the store is ready and the server has answered (so a late store still gets it).
  useEffect(() => {
    if (data && offline.ready) void offline.keepRoster(data.students.map((r) => r.studentId));
    // keepRoster is rebuilt when the store becomes ready, so depending on `ready` re-runs this with the live store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, offline.ready]);

  const base = useMemo(() => {
    const out: Record<string, MarkDraft> = {};
    if (data) {
      for (const row of data.students) {
        out[row.studentId] = {
          studentId: row.studentId,
          status: isStatus(row.status) ? row.status : null,
          arrivalTime: row.arrivalTime ?? "",
          note: "",
        };
      }
    }
    // Queued marks are shown on top of what the server has, so a teacher sees what is still unsent.
    for (const item of offline.items) {
      for (const m of item.marks) {
        out[m.studentId] = {
          studentId: m.studentId,
          status: m.status,
          arrivalTime: m.arrivalTime ?? "",
          note: "",
        };
      }
    }
    return out;
  }, [data, offline.items]);

  function markOf(studentId: string): MarkDraft {
    return {
      studentId,
      status: null,
      arrivalTime: "",
      note: "",
      ...base[studentId],
      ...edits[studentId],
    } as MarkDraft;
  }

  const rows: Array<{ studentId: string; name: string | null; admission: string | null }> = data
    ? data.students.map((r) => ({
        studentId: r.studentId,
        name: r.fullName,
        admission: r.admissionNo,
      }))
    : (offline.roster ?? []).map((id) => ({ studentId: id, name: null, admission: null }));

  const drafts = rows.map((r) => markOf(r.studentId));
  const counts = ATTENDANCE_STATUSES.map(
    (s) => [s, drafts.filter((d) => d.status === s).length] as const,
  );
  const refused = offline.items.filter((i) => i.state === "needsAttention");
  const labelOf = (id: string): string => {
    const index = rows.findIndex((r) => r.studentId === id);
    return rows[index]?.name ?? t("register.studentN", { n: index + 1 });
  };
  const pendingHere = offline.items.filter((i) => i.state === "pending").length;

  function setMark(studentId: string, patch: Partial<MarkDraft>) {
    setEdits((e) => ({ ...e, [studentId]: { ...e[studentId], ...patch } }));
  }

  async function flushNow(): Promise<import("./offline/sync").FlushReport | null> {
    if (!offline.ready) return null;
    const report = await offline.flush();
    if (report === null) return null; // A flush with nothing to send (another trigger already sent it) does not replace the message of the one that did.
    if (report.applied + report.ignored + report.refused === 0 && report.stopped === "none") {
      await qc.invalidateQueries({ queryKey: ["attendance-register"] });
      return report;
    }

    if (report.stopped === "offline") setMessage(t("sync.offlineStill"));
    else if (report.stopped === "server") setMessage(t("sync.serverBusy"));
    else if (report.stopped === "session") setMessage(t("sync.sessionEnded"));
    else
      setMessage(
        t("sync.summary", {
          applied: report.applied,
          ignored: report.ignored,
          refused: report.refused,
        }),
      );
    await qc.invalidateQueries({ queryKey: ["attendance-register"] });
    return report;
  }

  // Sync runs while this screen is open: when the browser comes back online, and when the page is focused again.
  useSyncOnReturn(() => {
    if (offline.items.length > 0) void flushNow();
  });

  async function saveOnDevice(): Promise<boolean> {
    if (!offline.ready) {
      setMessage(t("sync.storeNotReady"));
      return false;
    }
    // Partial saves are allowed: a teacher can save progress and finish later. Completeness is checked at submit.
    const problems = drafts
      .map((d) => arrivalProblem(d.status, d.arrivalTime))
      .filter((p): p is string => p !== null);
    if (problems.length > 0) {
      setMessage(t(`errors.${problems[0]}`));
      return false;
    }
    if (key === null) return false;
    const marks = queuedMarks(drafts, new Date(), () => crypto.randomUUID());
    if (marks.length === 0) {
      setMessage(t("register.nothingToSave"));
      return false;
    }
    try {
      await offline.enqueue(marks);
    } catch {
      setMessage(t("sync.storeNotReady"));
      return false;
    }
    setEdits({});
    return true;
  }

  async function onSave() {
    setBusy(true);
    setMessage(null);
    try {
      const queued = await saveOnDevice();
      if (queued) {
        toast({ tone: "success", title: t("register.saved") });
        if (online) await flushNow();
        else setMessage(t("register.savedOffline"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (key === null || data === undefined) return;
    if (drafts.some((d) => d.status === null)) {
      setMessage(t("submit.incomplete"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (offline.items.length === 0) {
        // Nothing queued: send the current marks directly so submit sees them.
        const marks = queuedMarks(drafts, new Date(), () => crypto.randomUUID());
        if (marks.length > 0) await offline.enqueue(marks);
        setEdits({});
      }
      const report = await flushNow();
      if (
        report === null ||
        report.stopped !== "none" ||
        report.refused > 0 ||
        (await offline.openCount()) > 0
      ) {
        setMessage(t("submit.syncFirst"));
        return;
      }
      const outcome = await submitRegister(classArmId, date, null);
      await qc.invalidateQueries({ queryKey: ["attendance-register"] });
      setMessage(
        outcome.alreadySubmitted
          ? t("submit.already")
          : t("submit.done", { alerts: Number(outcome.alertsRaised) }),
      );
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  if (access.loading) return <SkeletonList rows={4} label={tState("loading")} />;
  if (!access.canReadMark)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;
  if (key === null)
    return <EmptyState title={t("register.chooseTitle")} description={t("register.chooseBody")} />;
  if (online && reg.isPending && offline.roster === null)
    return <SkeletonList rows={4} label={tState("loading")} />;
  if (online && reg.isError && offline.roster === null)
    return (
      <ErrorState
        title={tState("errorTitle")}
        description={tState("errorBody")}
        problem={reg.error instanceof ApiError ? reg.error.problem : null}
        onRetry={() => void reg.refetch()}
      />
    );
  if (!online && offline.roster === null && offline.ready)
    return (
      <EmptyState
        title={t("register.offlineNoRegisterTitle")}
        description={t("register.offlineNoRegisterBody")}
      />
    );

  const locked = data?.locked === true;
  const readOnly = !access.canMark || locked || access.readOnlyNotice;
  const sessionStatus = data?.sessionStatus ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("register.title", { arm: armLabel })}
        description={t("register.intro", { date: formatCalendarDate(date) })}
        actions={
          <Link
            href="/attendance"
            className="text-sm font-semibold text-brand underline underline-offset-4"
          >
            {t("register.backToHome")}
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge tone={online ? "success" : "warning"}>
          {online ? t("sync.online") : t("sync.offline")}
        </StatusBadge>
        {pendingHere > 0 ? (
          <StatusBadge tone="info">{t("sync.pending", { count: pendingHere })}</StatusBadge>
        ) : null}
        {sessionStatus !== null ? (
          <span className="text-muted-foreground">
            {t("register.sessionStatus", { status: sessionStatus })}
          </span>
        ) : null}
      </div>

      {data && !data.isSchoolDay ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {t("register.notSchoolDay")}
        </p>
      ) : null}
      {locked ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {t("register.locked")}
        </p>
      ) : null}
      {!online ? (
        <p
          role="status"
          className="rounded-control bg-brand-soft px-4 py-3 text-sm text-brand-soft-foreground"
        >
          {t("register.offlineNote")}
        </p>
      ) : null}

      <Card className="flex flex-wrap gap-3 text-sm">
        {counts.map(([s, n]) => (
          <span key={s} className="inline-flex items-center gap-2">
            <StatusBadge tone={STATUS_TONE[s]}>{t(`status.${s}`)}</StatusBadge>
            <span className="tabular-nums">{n}</span>
          </span>
        ))}
      </Card>

      {refused.length > 0 ? (
        <Card className="flex flex-col gap-4 border-warning/40">
          <h2 className="font-display text-lg font-semibold text-foreground">
            {t("refused.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("refused.body")}</p>
          {refused.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-control border border-border p-4"
            >
              {item.refusedWhole !== null ? (
                <p className="text-sm text-danger-foreground">
                  {t("refused.whole", { code: item.refusedWhole })}
                </p>
              ) : null}
              <ul className="flex flex-col gap-1 text-sm">
                {item.refused.map((r) => (
                  <li key={r.studentId} className="text-foreground">
                    {t("refused.row", { student: labelOf(r.studentId), reason: r.reason })}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                {access.canMark ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void offline.resend(item.id!)}
                  >
                    {t("refused.resend")}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void offline.discard(item.id!)}
                >
                  {t("refused.discard")}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      <ul className="flex flex-col gap-3" aria-label={t("register.list")}>
        {rows.map((row, index) => {
          const d = markOf(row.studentId);
          const label = row.name ?? t("register.studentN", { n: index + 1 });
          const arrival = d.status === "Late" ? arrivalProblem("Late", d.arrivalTime) : null;
          return (
            <li
              key={row.studentId}
              className="flex flex-col gap-3 rounded-card border border-border/80 bg-surface p-4 shadow-card"
            >
              <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-foreground">{label}</p>
                {row.admission ? (
                  <p className="font-mono text-xs text-muted-foreground">{row.admission}</p>
                ) : null}
              </div>
              <div
                role="group"
                aria-label={t("register.statusFor", { student: label })}
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {ATTENDANCE_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={d.status === s}
                    disabled={readOnly}
                    onClick={() =>
                      setMark(row.studentId, {
                        status: s,
                        arrivalTime: s === "Late" ? d.arrivalTime : "",
                      })
                    }
                    className={`min-h-11 rounded-control border px-3 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 ${d.status === s ? "border-brand bg-brand text-on-brand" : "border-border bg-surface text-foreground hover:bg-muted"}`}
                  >
                    {t(`status.${s}`)}
                  </button>
                ))}
              </div>
              {d.status === "Late" ? (
                <Input
                  label={t("register.arrival")}
                  type="time"
                  value={d.arrivalTime}
                  disabled={readOnly}
                  onChange={(e) => setMark(row.studentId, { arrivalTime: e.target.value })}
                  error={arrival ? t(`errors.${arrival}`) : undefined}
                  hint={t("register.arrivalHint")}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {message ? (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      ) : null}

      {!readOnly ? (
        <div className="sticky bottom-20 z-10 flex flex-col-reverse gap-3 rounded-card border border-border bg-surface p-4 shadow-raised sm:flex-row sm:justify-end md:static md:bottom-auto md:shadow-card">
          <Button
            variant="secondary"
            onClick={() => void flushNow()}
            disabled={busy || !online || offline.items.length === 0}
          >
            {t("sync.now")}
          </Button>
          <Button
            variant="secondary"
            onClick={onSave}
            disabled={!offline.ready || busy}
            loading={busy}
            loadingLabel={tState("loading")}
          >
            {t("register.save")}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={busy || !online || data === undefined}
            loading={busy}
            loadingLabel={tState("loading")}
          >
            {t("submit.action")}
          </Button>
        </div>
      ) : null}

      {locked && access.canEditPast ? (
        <div>
          <Button variant="ghost" onClick={() => setReopening(true)}>
            {t("reopen.action")}
          </Button>
        </div>
      ) : null}

      {reopening && key !== null ? (
        <Suspense fallback={null}>
          <ReopenRegisterDialog
            classArmId={key.classArmId}
            date={key.date}
            onClose={() => setReopening(false)}
            onDone={async () => {
              setReopening(false);
              await qc.invalidateQueries({ queryKey: ["attendance-register"] });
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
