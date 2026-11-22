"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
  cellKey,
  changedCells,
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

function pairValue(armId: string, subjectId: string): string {
  return `${armId}|${subjectId}`;
}

function parsePair(value: string): { armId: string; subjectId: string } | null {
  const [armId = "", subjectId = ""] = value.split("|");
  return armId && subjectId ? { armId, subjectId } : null;
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

  const [pairChoice, setPairChoice] = useState("");
  const [termChoice, setTermChoice] = useState("");
  const pair =
    pairChoice ||
    (teaching[0] ? pairValue(teaching[0].classArmId, teaching[0].subjectId ?? "") : "");
  const current = terms.data?.find((x) => x.isCurrent) ?? terms.data?.[0];
  const termId = termChoice || current?.id || "";
  const parsed = parsePair(pair);
  const key: SheetKey | null =
    parsed && termId ? { termId, classArmId: parsed.armId, subjectId: parsed.subjectId } : null;
  const sheet = useQuery({ ...sheetQuery(key ?? NO_KEY), enabled: key !== null });

  const [edits, setEdits] = useState<{ sheetId: string; draft: ScoreDraft } | null>(null);
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
        : draftFromServer(
            sheetData.students.flatMap((s) =>
              s.cells.map((c) => ({ studentId: s.studentId, ...c })),
            ),
          );
  const actions = sheetData ? sheetActions(sheetData.status) : null;
  const components = [...(scheme.data?.components ?? [])].sort(
    (a, b) => Number(a.order) - Number(b.order),
  );
  const serverCells = sheetData
    ? sheetData.students.flatMap((s) => s.cells.map((c) => ({ studentId: s.studentId, ...c })))
    : [];

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
  const pendingRows = draft && sheetData ? changedCells(serverCells, draft) : [];

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
      ) : assignments.data && teaching.length === 0 ? (
        <EmptyState title={t("none.title")} description={t("none.body")} />
      ) : (
        <Card className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t("pick.classSubject")}
              value={pair}
              onChange={(e) => {
                setPairChoice(e.target.value);
                setEdits(null);
                setOutcome(null);
                setMessage(null);
              }}
            >
              {teaching.map((a) => (
                <option key={a.id} value={pairValue(a.classArmId, a.subjectId ?? "")}>
                  {`${armName(a.classArmId)} · ${subjectName(a.subjectId ?? "")}`}
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
                      const editable = actions?.canSave === true && writesAllowed;
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
                onClick={save}
                disabled={
                  !writesAllowed || busy !== null || pendingRows.length === 0 || hasProblems
                }
                loading={busy === "save"}
                loadingLabel={t("saving")}
              >
                {t("save")}
              </Button>
            </div>
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
                    disabled={!writesAllowed || busy !== null}
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
