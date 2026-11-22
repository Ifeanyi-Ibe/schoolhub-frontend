"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { useOnline } from "@/components/ui/offline-status";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { refusalText } from "@/features/students/refusal";
import { newActionKey } from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/unwrap";
import { useAssessmentAccess } from "./access";
import { useOfflineScores } from "./offline/engine";
import type { ScoreFlushReport } from "./offline/sync";
import {
  approveSheet,
  armNamesQuery,
  defaultSchemeQuery,
  myAssignmentsOnlyQuery,
  openSheet,
  reopenSheet,
  saveScores,
  sheetQuery,
  submitSheet,
  subjectsQuery,
  termsQuery,
  type RecordScoresOutcome,
  type ScoreSheetView,
  type SheetKey,
} from "./api";
import {
  KNOWN_SHEET_STATUSES,
  changedAgainst,
  overlayRows,
  cellKey,
  draftFromServer,
  reopenReasonProblem,
  scoreProblem,
  sheetActions,
  type ScoreDraft,
} from "./rules";

const STATUS_TONE: Record<string, StatusTone> = {
  Draft: "neutral",
  Submitted: "info",
  Approved: "success",
  Published: "success",
};

const NO_KEY: SheetKey = { termId: "", classArmId: "", subjectId: "" };

/** The server's cells for a sheet, in the shape the draft and the change check use. */
function sheetCells(sheet: ScoreSheetView) {
  return sheet.students.flatMap((s) => s.cells.map((c) => ({ studentId: s.studentId, ...c })));
}

/**
 * Score sheets for the classes and subjects the signed-in user teaches (ADR 0022, slice 1). Every change is sent to the server,
 * and what the screen shows afterwards is the server's answer: nothing is shown as saved until the server has said so.
 */
export function ScoresView() {
  const t = useTranslations("scores");
  const tState = useTranslations("scores.state");
  const qc = useQueryClient();
  const access = useAssessmentAccess();
  const online = useOnline();

  const assignments = useQuery(myAssignmentsOnlyQuery());
  const sessionId = assignments.data?.sessionId ?? "";
  const teaching = (assignments.data?.assignments ?? []).filter((a) => a.subjectId);
  const terms = useQuery({ ...termsQuery(sessionId), enabled: sessionId !== "" });
  const subjects = useQuery(subjectsQuery());
  const arms = useQuery(armNamesQuery());
  const scheme = useQuery(defaultSchemeQuery());

  // Teachers choose among their own classes and subjects. An approver chooses among all of the school's, because the
  // contract finds a sheet only by term, class and subject (ADR 0022, decision 8).
  const browse = access.canApprove;
  const armOptions: Array<{ id: string; name: string }> = browse
    ? [...(arms.data?.entries() ?? [])]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [...new Set(teaching.map((a) => a.classArmId))].map((id) => ({
        id,
        name: arms.data?.get(id) ?? "",
      }));
  const [armChoice, setArmChoice] = useState("");
  const armId = armOptions.some((o) => o.id === armChoice) ? armChoice : (armOptions[0]?.id ?? "");
  const subjectOptions: Array<{ id: string; name: string }> = browse
    ? (subjects.data ?? []).map((s) => ({ id: s.id, name: s.name }))
    : teaching
        .filter((a) => a.classArmId === armId && a.subjectId)
        .map((a) => ({
          id: a.subjectId ?? "",
          name: subjects.data?.find((s) => s.id === a.subjectId)?.name ?? "",
        }));
  const [subjectChoice, setSubjectChoice] = useState("");
  const subjectId = subjectOptions.some((o) => o.id === subjectChoice)
    ? subjectChoice
    : (subjectOptions[0]?.id ?? "");
  const [termChoice, setTermChoice] = useState("");
  const current = terms.data?.find((x) => x.isCurrent) ?? terms.data?.[0];
  const termId = termChoice || current?.id || "";
  const key: SheetKey | null =
    armId && subjectId && termId ? { termId, classArmId: armId, subjectId } : null;
  const sheet = useQuery({ ...sheetQuery(key ?? NO_KEY), enabled: key !== null });

  // Score entry on this device (ADR 0023): cells saved while offline are queued here, and the screen shows them over the
  // server's values until the server has answered.
  const offline = useOfflineScores(key, sheet.data?.id ?? null);
  const queuedRows = offline.items.flatMap((i) => i.rows);
  const base: ScoreDraft = sheet.data
    ? overlayRows(draftFromServer(sheetCells(sheet.data)), queuedRows)
    : new Map();
  const [syncReport, setSyncReport] = useState<ScoreFlushReport | null>(null);
  /** Sends the queued saves. Refused cells stay in the queue with the server's reason. */
  async function sendQueued() {
    const report = await offline.flush();
    if (report) {
      setSyncReport(report);
      await qc.invalidateQueries({ queryKey: sheetQuery(key ?? NO_KEY).queryKey });
    }
  }
  // Sends the queue when the connection returns, and when the screen opens online (ADR 0023). Keyed on the connection, so
  // it runs on the change, not on every render.
  useEffect(() => {
    // The flush settles after the server answers, so the state update follows an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (online) void sendQueued();
    // sendQueued reads the current queue when it runs; only the connection should start a send.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
  const [edits, setEdits] = useState<{ sheetId: string; draft: ScoreDraft } | null>(null);
  // Unsaved cells: warn before the page is left. In-app navigation is not covered yet (OPEN_ITEMS).
  const unsaved =
    edits !== null && sheet.data ? changedAgainst(base, edits.draft).length > 0 : false;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RecordScoresOutcome | null>(null);
  const [saveKey, setSaveKey] = useState(() => newActionKey());
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenTried, setReopenTried] = useState(false);

  if (access.loading) return <SkeletonList rows={4} label={tState("loading")} />;
  if (access.failed) return <ErrorState title={t("loadError")} />;
  if (!access.canView)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  const writesAllowed = access.canEnter && online;
  const sheetData: ScoreSheetView | null | undefined = sheet.data;
  const draft: ScoreDraft | null =
    sheetData === null || sheetData === undefined
      ? null
      : edits?.sheetId === sheetData.id
        ? edits.draft
        : base;
  const actions = sheetData ? sheetActions(sheetData.status) : null;
  const components = [...(scheme.data?.components ?? [])].sort(
    (a, b) => Number(a.order) - Number(b.order),
  );

  function armName(armId: string): string {
    return arms.data?.get(armId) ?? "";
  }

  function subjectName(subjectId: string): string {
    return subjects.data?.find((s) => s.id === subjectId)?.name ?? "";
  }

  function setCell(
    studentId: string,
    componentId: string,
    patch: { score?: string; absent?: boolean },
  ) {
    if (!sheetData || !draft) return;
    const k = cellKey(studentId, componentId);
    const before = draft.get(k) ?? { score: "", absent: false };
    const next = new Map(draft);
    next.set(k, { ...before, ...patch });
    setEdits({ sheetId: sheetData.id, draft: next });
  }

  function cellProblem(studentId: string, componentId: string, max: number): string | null {
    if (!draft) return null;
    const cell = draft.get(cellKey(studentId, componentId));
    if (!cell) return null;
    const problem = scoreProblem(cell.score, max, cell.absent);
    return problem ? t(`problem.${problem}`, { max: String(max) }) : null;
  }

  const hasProblems =
    draft !== null &&
    components.some((c) =>
      (sheetData?.students ?? []).some(
        (s) => cellProblem(s.studentId, c.id, Number(c.maxScore)) !== null,
      ),
    );
  const pendingRows = draft && sheetData ? changedAgainst(base, draft) : [];

  async function open() {
    if (!key) return;
    setBusy("open");
    setMessage(null);
    try {
      const created = await openSheet(key, newActionKey());
      qc.setQueryData(sheetQuery(key).queryKey, created);
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!sheetData || pendingRows.length === 0) return;
    setBusy("save");
    setMessage(null);
    setOutcome(null);
    try {
      const result = await saveScores(sheetData.id, pendingRows, saveKey);
      setOutcome(result);
      setSaveKey(newActionKey());
      await qc.invalidateQueries({ queryKey: sheetQuery(key ?? NO_KEY).queryKey });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(null);
    }
  }

  function studentName(studentId: string): string {
    return sheetData?.students.find((x) => x.studentId === studentId)?.studentName ?? "";
  }

  function componentName(componentId: string): string {
    return components.find((c) => c.id === componentId)?.name ?? "";
  }

  /** Saves the cells on this device. Nothing is sent; the queue sends them when the connection returns. */
  async function saveOffline() {
    if (!sheetData || pendingRows.length === 0) return;
    setBusy("save");
    setMessage(null);
    setOutcome(null);
    try {
      const now = new Date().toISOString();
      await offline.enqueue(pendingRows.map((r) => ({ ...r, clientUpdatedAt: now })));
      setEdits(null);
      setMessage(t("savedHere", { count: String(pendingRows.length) }));
    } catch {
      setMessage(t("saveHereFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function run(label: string, action: () => Promise<ScoreSheetView>) {
    if (!key) return;
    setBusy(label);
    setMessage(null);
    try {
      const updated = await action();
      qc.setQueryData(sheetQuery(key).queryKey, updated);
      setConfirmSubmit(false);
      setReopenReason("");
      setReopenTried(false);
      setEdits(null);
    } catch (err) {
      setMessage(
        err instanceof ApiError ? refusalText(err, tState) : tState("refused", { code: "unknown" }),
      );
    } finally {
      setBusy(null);
    }
  }

  const reasonProblem = reopenReasonProblem(reopenReason);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />

      {access.readOnlyNotice ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {t("readOnly")}
        </p>
      ) : null}
      {!online ? (
        <p
          role="status"
          className="rounded-control bg-warning-surface px-4 py-3 text-sm text-warning-foreground"
        >
          {t("offline")}
        </p>
      ) : null}

      {assignments.isError ? (
        <ErrorState title={t("loadError")} onRetry={() => void assignments.refetch()} />
      ) : assignments.data && !browse && teaching.length === 0 ? (
        <EmptyState title={t("none.title")} description={t("none.body")} />
      ) : (
        <Card className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label={t("pick.class")}
              value={armId}
              onChange={(e) => {
                setArmChoice(e.target.value);
                setSubjectChoice("");
                setEdits(null);
                setOutcome(null);
                setMessage(null);
              }}
            >
              {armOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
            <Select
              label={t("pick.subject")}
              value={subjectId}
              onChange={(e) => {
                setSubjectChoice(e.target.value);
                setEdits(null);
                setOutcome(null);
                setMessage(null);
              }}
            >
              {subjectOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
            <Select
              label={t("pick.term")}
              value={termId}
              onChange={(e) => {
                setTermChoice(e.target.value);
                setEdits(null);
                setOutcome(null);
              }}
            >
              {(terms.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </div>
        </Card>
      )}

      {key && sheet.isError ? (
        <ErrorState title={t("loadError")} onRetry={() => void sheet.refetch()} />
      ) : null}
      {key && sheet.isPending ? <SkeletonList rows={4} label={tState("loading")} /> : null}

      {key && sheetData === null ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState title={t("noSheet.title")} description={t("noSheet.body")} />
          {access.canEnter ? (
            <Button
              onClick={open}
              disabled={!writesAllowed || busy !== null}
              loading={busy === "open"}
              loadingLabel={t("opening")}
            >
              {t("open")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {sheetData && draft ? (
        <section aria-labelledby="sheet-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="sheet-title" className="text-lg font-semibold text-foreground">
              {`${subjectName(sheetData.subjectId)} · ${armName(sheetData.classArmId)}`}
            </h2>
            <StatusBadge tone={STATUS_TONE[sheetData.status] ?? "neutral"}>
              {(KNOWN_SHEET_STATUSES as readonly string[]).includes(sheetData.status)
                ? t(`status.${sheetData.status as (typeof KNOWN_SHEET_STATUSES)[number]}`)
                : sheetData.status}
            </StatusBadge>
          </div>

          {scheme.data === null ? (
            <p role="alert" className="text-sm text-danger-foreground">
              {t("noScheme")}
            </p>
          ) : null}

          {sheetData.students.length === 0 ? (
            <EmptyState title={t("noStudents.title")} description={t("noStudents.body")} />
          ) : (
            <ul className="flex flex-col gap-3">
              {sheetData.students.map((s) => (
                <li key={s.studentId}>
                  <Card className="flex flex-col gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{s.studentName}</p>
                      <p className="text-xs text-muted-foreground">{s.admissionNo}</p>
                    </div>
                    {components.map((c) => {
                      const cell = draft.get(cellKey(s.studentId, c.id)) ?? {
                        score: "",
                        absent: false,
                      };
                      const problem = cellProblem(s.studentId, c.id, Number(c.maxScore));
                      const editable = actions?.canSave === true && access.canEnter;
                      return (
                        <div key={c.id} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                          <Input
                            label={t("cell.label", { component: c.name, max: String(c.maxScore) })}
                            inputMode="decimal"
                            value={cell.score}
                            disabled={!editable || cell.absent}
                            onChange={(e) => setCell(s.studentId, c.id, { score: e.target.value })}
                            error={problem ?? undefined}
                          />
                          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
                            <input
                              type="checkbox"
                              className="size-5"
                              checked={cell.absent}
                              disabled={!editable}
                              onChange={(e) =>
                                setCell(s.studentId, c.id, {
                                  absent: e.target.checked,
                                  ...(e.target.checked ? { score: "" } : {}),
                                })
                              }
                            />
                            {t("cell.absent")}
                          </label>
                        </div>
                      );
                    })}
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {actions?.canSave && access.canEnter ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {hasProblems ? (
                <p className="text-sm text-danger-foreground">{t("fixFirst")}</p>
              ) : null}
              <Button
                onClick={online ? save : saveOffline}
                disabled={
                  (online ? !writesAllowed : !offline.ready) ||
                  busy !== null ||
                  pendingRows.length === 0 ||
                  hasProblems
                }
                loading={busy === "save"}
                loadingLabel={t("saving")}
              >
                {online ? t("save") : t("saveHere")}
              </Button>
            </div>
          ) : null}

          {syncReport ? (
            <p role="status" className="text-sm text-foreground">
              {syncReport.stopped !== "none"
                ? t("sync.stopped")
                : t("sync.result", {
                    applied: String(syncReport.applied),
                    ignored: String(syncReport.ignored),
                    refused: String(syncReport.refused),
                  })}
            </p>
          ) : null}
          {offline.items.length > 0 ? (
            <section
              aria-labelledby="queue-title"
              className="flex flex-col gap-3 rounded-control border border-border p-4"
            >
              <h3 id="queue-title" className="text-sm font-semibold text-foreground">
                {t("queue.title")}
              </h3>
              <p className="text-sm text-foreground">
                {t("queue.pending", {
                  count: String(
                    offline.items
                      .filter((i) => i.state === "pending")
                      .reduce((n, i) => n + i.rows.length, 0),
                  ),
                })}
              </p>
              {offline.items
                .filter((i) => i.state === "needsAttention")
                .map((item) => (
                  <div key={item.id} className="flex flex-col gap-2">
                    <ul className="flex flex-col gap-1 text-sm text-danger-foreground">
                      {item.refused.map((r) => (
                        <li key={`${r.studentId}-${r.componentId}`}>
                          {t("queue.refusedCell", {
                            student: studentName(r.studentId),
                            component: componentName(r.componentId),
                            reason: r.reason,
                          })}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        onClick={() => void offline.resend(item.id ?? 0)}
                        disabled={!online || busy !== null}
                      >
                        {t("queue.resend")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => void offline.discard(item.id ?? 0)}
                        disabled={busy !== null}
                      >
                        {t("queue.discard")}
                      </Button>
                    </div>
                  </div>
                ))}
              {online && offline.items.some((i) => i.state === "pending") ? (
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => void sendQueued()}
                    disabled={busy !== null}
                  >
                    {t("queue.send")}
                  </Button>
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">{t("queue.submitFirst")}</p>
            </section>
          ) : null}

          {outcome ? (
            <div
              role="status"
              className="flex flex-col gap-2 rounded-control bg-background px-4 py-3 text-sm"
            >
              <p>
                {t("outcome", {
                  applied: String(outcome.applied),
                  ignored: String(outcome.ignored),
                  rejected: String(outcome.rejected),
                })}
              </p>
              {outcome.rows
                .filter((r) => r.result.toLowerCase() !== "applied")
                .map((r) => (
                  <p key={`${r.studentId}-${r.componentId}`} className="text-danger-foreground">
                    {t("refusedRow", { reason: r.reason ?? r.result })}
                  </p>
                ))}
            </div>
          ) : null}

          {actions?.canSubmit && access.canEnter ? (
            <div className="flex flex-col gap-2 rounded-control border border-border p-4">
              {confirmSubmit ? (
                <>
                  <p className="text-sm text-foreground">{t("submitConfirm")}</p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => run("submit", () => submitSheet(sheetData.id))}
                      disabled={!writesAllowed || busy !== null}
                      loading={busy === "submit"}
                      loadingLabel={t("submitting")}
                    >
                      {t("submitNow")}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setConfirmSubmit(false)}
                      disabled={busy !== null}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmSubmit(true)}
                    disabled={!writesAllowed || busy !== null || offline.items.length > 0}
                  >
                    {t("submit")}
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {actions?.canApprove && access.canApprove ? (
            <div className="flex justify-end">
              <Button
                onClick={() => run("approve", () => approveSheet(sheetData.id))}
                disabled={!writesAllowed || busy !== null}
                loading={busy === "approve"}
                loadingLabel={t("approving")}
              >
                {t("approve")}
              </Button>
            </div>
          ) : null}

          {actions?.canReopen && access.canApprove ? (
            <div className="flex flex-col gap-3 rounded-control border border-border p-4">
              <Input
                label={t("reopenReason")}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                error={
                  reopenTried && reasonProblem ? t(`reopenProblem.${reasonProblem}`) : undefined
                }
              />
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setReopenTried(true);
                    if (reasonProblem === null)
                      void run("reopen", () => reopenSheet(sheetData.id, reopenReason.trim()));
                  }}
                  disabled={!writesAllowed || busy !== null}
                  loading={busy === "reopen"}
                  loadingLabel={t("reopening")}
                >
                  {t("reopen")}
                </Button>
              </div>
            </div>
          ) : null}

          {message ? (
            <p role="alert" className="text-sm text-danger-foreground">
              {message}
            </p>
          ) : null}
        </section>
      ) : null}

      {message && !sheetData ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
