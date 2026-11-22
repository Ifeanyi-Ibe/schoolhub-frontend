// Assessment rules (ADR 0022): exact scores, the checks a cell needs before it is sent, and what a sheet's status allows.
// The server decides what is allowed; these checks stop a typo before a request, and the screens show the server's answer.

export const ASSESSMENT_PERMISSION = {
  enter: "results.scores.enter",
  approve: "results.approve",
  publish: "results.publish",
} as const;

export const SCORE_DECIMALS = 1;

export type ScoreProblem = "format" | "negative" | "range" | "absentWithScore";

/** A score in tenths (one decimal place), or null for a blank cell (not entered; blank is not zero). */
export function scoreTenths(text: string): number | null | "format" {
  const s = text.trim();
  if (s === "") return null;
  const m = /^(\d+)(?:\.(\d))?$/.exec(s);
  if (!m) return "format";
  const whole = Number(m[1]);
  const tenth = m[2] === undefined ? 0 : Number(m[2]);
  const tenths = whole * 10 + tenth;
  return Number.isSafeInteger(tenths) ? tenths : "format";
}

/** The first problem with one cell, or null. `maxScore` is the component's maximum (a whole number). */
export function scoreProblem(text: string, maxScore: number, absent: boolean): ScoreProblem | null {
  const tenths = scoreTenths(text);
  if (absent) return tenths === null ? null : "absentWithScore";
  if (tenths === null) return null;
  if (tenths === "format") return "format";
  if (tenths < 0) return "negative";
  if (tenths > maxScore * 10) return "range";
  return null;
}

export interface SheetCell {
  score: string;
  absent: boolean;
}

/** Cells keyed by `${studentId}|${componentId}`: the teacher's draft, kept apart from the server's copy. */
export type ScoreDraft = Map<string, SheetCell>;

export function cellKey(studentId: string, componentId: string): string {
  return `${studentId}|${componentId}`;
}

export interface ServerCell {
  studentId: string;
  componentId: string;
  score: number | string | null;
  absent: boolean;
}

/** The server's values as a draft. A score the server returns as a number is written as its decimal text. */
export function draftFromServer(cells: readonly ServerCell[]): ScoreDraft {
  const draft: ScoreDraft = new Map();
  for (const c of cells) {
    draft.set(cellKey(c.studentId, c.componentId), {
      score: c.score === null ? "" : String(c.score),
      absent: c.absent,
    });
  }
  return draft;
}

/** The cells the teacher changed since the server's copy. Only these are sent. */
export function changedCells(
  server: readonly ServerCell[],
  draft: ScoreDraft,
): Array<{ studentId: string; componentId: string; score: string | null; absent: boolean }> {
  const serverDraft = draftFromServer(server);
  const out: Array<{
    studentId: string;
    componentId: string;
    score: string | null;
    absent: boolean;
  }> = [];
  for (const [key, cell] of draft) {
    const before = serverDraft.get(key) ?? { score: "", absent: false };
    if (before.score === cell.score.trim() && before.absent === cell.absent) continue;
    const [studentId = "", componentId = ""] = key.split("|");
    const score = cell.absent || cell.score.trim() === "" ? null : cell.score.trim();
    out.push({ studentId, componentId, score, absent: cell.absent });
  }
  return out;
}

export interface SheetStatusActions {
  canSave: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReopen: boolean;
}

/** What a sheet's status allows (ADR 0022, decision 4). Reopen is possible only before publication. */
export function sheetActions(status: string): SheetStatusActions {
  return {
    canSave: status === "Draft",
    canSubmit: status === "Draft",
    canApprove: status === "Submitted",
    canReopen: status === "Submitted" || status === "Approved",
  };
}

/** The status labels the backend uses. Any other value is shown as it arrives (B-41). */
export const KNOWN_SHEET_STATUSES = ["Draft", "Submitted", "Approved", "Published"] as const;

export function reopenReasonProblem(text: string): string | null {
  const s = text.trim();
  if (s === "") return "required";
  if (s.length > 300) return "tooLong";
  return null;
}

/** The key a sheet is queued and cached under: term, class arm and subject (ADR 0023). */
export function sheetKeyOf(key: { termId: string; classArmId: string; subjectId: string }): string {
  return `${key.termId}|${key.classArmId}|${key.subjectId}`;
}

/**
 * What the server said about one row. The backend has written results with different capitals ("Applied",
 * "IgnoredNewerExists"), so the first word is compared in lower case. Anything else is a refusal the teacher must see.
 */
export function scoreRowKind(result: string): "applied" | "ignored" | "refused" {
  const word = result.toLowerCase();
  if (word.startsWith("applied")) return "applied";
  if (word.startsWith("ignored")) return "ignored";
  return "refused";
}

/** Lays queued cells over a draft, in the order they were queued, so the screen shows what is still on this device. */
export function overlayRows(
  draft: ScoreDraft,
  rows: ReadonlyArray<{
    studentId: string;
    componentId: string;
    score: string | null;
    absent: boolean;
  }>,
): ScoreDraft {
  const next = new Map(draft);
  for (const r of rows) {
    next.set(cellKey(r.studentId, r.componentId), { score: r.score ?? "", absent: r.absent });
  }
  return next;
}

/**
 * The cells that differ from a base draft: the server's values with the cells still queued on this device laid over them.
 * Only these are sent or queued, so a cell is never sent twice.
 */
export function changedAgainst(
  base: ScoreDraft,
  draft: ScoreDraft,
): Array<{ studentId: string; componentId: string; score: string | null; absent: boolean }> {
  const out: Array<{
    studentId: string;
    componentId: string;
    score: string | null;
    absent: boolean;
  }> = [];
  for (const [key, cell] of draft) {
    const before = base.get(key) ?? { score: "", absent: false };
    if (before.score === cell.score.trim() && before.absent === cell.absent) continue;
    const [studentId = "", componentId = ""] = key.split("|");
    const score = cell.absent || cell.score.trim() === "" ? null : cell.score.trim();
    out.push({ studentId, componentId, score, absent: cell.absent });
  }
  return out;
}
