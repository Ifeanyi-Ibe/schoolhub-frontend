// Attendance: the daily register, the offline queue and the reading of sync results. Constants come from the contract
// (RegisterEntry, RowOutcome) and the feature spec (section 6). The API decides what is allowed; these checks stop a
// request the contract would refuse, and keep the queue honest.

export const ATTENDANCE_PERMISSION = {
  mark: "attendance.mark",
  editPast: "attendance.edit.past",
  export: "attendance.export",
} as const;

export const ATTENDANCE_STATUSES = ["Present", "Absent", "Late", "Excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** A mark as the screen holds it, before it is saved or queued. */
export interface MarkDraft {
  studentId: string;
  status: AttendanceStatus | null;
  arrivalTime: string;
  note: string;
}

/** A mark as it is queued on the device. It carries no name, no admission number and no note (ADR 0017). */
export interface QueuedMark {
  studentId: string;
  status: AttendanceStatus;
  arrivalTime: string | null;
  clientId: string;
  clientUpdatedAt: string;
}

/** The register's identity: one class arm, one day, and the period (null for the daily register). */
export interface RegisterKey {
  classArmId: string;
  date: string;
  period: string | null;
}

export function registerKey(k: RegisterKey): string {
  return `${k.classArmId}|${k.date}|${k.period ?? ""}`;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A late arrival may carry a time (24-hour HH:MM). Other statuses carry none. */
export function arrivalProblem(
  status: AttendanceStatus | null,
  arrivalTime: string,
): string | null {
  const t = arrivalTime.trim();
  if (t === "") return null;
  if (status !== "Late") return "arrivalOnlyWhenLate";
  return HHMM.test(t) ? null : "arrivalFormat";
}

/** The problems that stop a register from being saved: every row needs a status and a valid arrival time. */
export function markProblems(rows: readonly MarkDraft[]): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.status === null) out.add("statusRequired");
    const p = arrivalProblem(r.status, r.arrivalTime);
    if (p) out.add(p);
  }
  return [...out];
}

/** The rows that are ready to be sent: rows with a status. An unmarked row is not sent (it stays unmarked). */
export function queuedMarks(
  rows: readonly MarkDraft[],
  now: Date,
  newId: () => string,
): QueuedMark[] {
  const at = now.toISOString();
  return rows
    .filter((r): r is MarkDraft & { status: AttendanceStatus } => r.status !== null)
    .map((r) => ({
      studentId: r.studentId,
      status: r.status,
      arrivalTime: r.arrivalTime.trim() === "" ? null : r.arrivalTime.trim(),
      clientId: newId(),
      clientUpdatedAt: at,
    }));
}

/**
 * The result of one row, as the server reports it. `applied` and `ignored_newer_exists` are settled; anything else
 * (a rejection, or a result this screen does not know) stays in the queue for the teacher, so it is never dropped.
 */
export type RowResult = "applied" | "ignored" | "needsAttention";

export function rowResult(result: string): RowResult {
  // The contract leaves the result a free string, and the server's spelling has differed from the spec's (B-38).
  // Compare letters only: "applied", "Applied", "ignored_newer_exists", "IgnoredNewerExists" all read the same way.
  const key = result.toLowerCase().replace(/[^a-z]/g, "");
  if (key === "applied") return "applied";
  if (key.startsWith("ignored")) return "ignored";
  return "needsAttention";
}

/** Whether a queued item still has rows the server has not settled. */
export function hasOpenRows(outcomes: ReadonlyArray<{ result: RowResult }>): boolean {
  return outcomes.some((o) => o.result === "needsAttention");
}

/** Whether a register is a school day, as the server reports it. Marks on a non-school day are refused by the server. */
export function isSchoolDay(view: { isSchoolDay: boolean }): boolean {
  return view.isSchoolDay;
}
