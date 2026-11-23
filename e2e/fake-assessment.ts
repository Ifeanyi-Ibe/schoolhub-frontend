// Test double for the score sheets (ADR 0022, slice 1): open, enter scores, submit, approve and reopen, with the assignments
// the screen chooses from. The main fake (fake-api.ts) validates every request against the contract, then calls
// handleAssessment. Identifiers are fixed; state is in memory and resets with the run.
import type { ServerResponse } from "node:http";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface AssessmentCall {
  method: string;
  path: string;
  url: URL;
  body: Record<string, unknown>;
  res: ServerResponse;
  send: Send;
  label: string;
  components: ReadonlyArray<{ id: string; name: string; maxScore: number; order: number }>;
  termIds?: readonly string[];
}

const problem = (status: number, code: string, title: string) => ({
  type: `urn:schoolhub:error:${code}`,
  title,
  status,
  detail: title,
  code,
});

export const ASSESSMENT_SESSION = "0190a6c2-0000-7000-8000-000000000801";
export const ASSESSMENT_ARM = "0190a6c2-0000-7000-8000-000000000401";
export const ASSESSMENT_SUBJECT = "0190a6c2-0000-7000-8000-000000000401";

const STUDENTS = [
  {
    studentId: "0190a6c2-0000-7000-8000-000000000f01",
    admissionNo: "GFA/0201",
    studentName: "Ada Okafor",
  },
  {
    studentId: "0190a6c2-0000-7000-8000-000000000f02",
    admissionNo: "GFA/0202",
    studentName: "Bola Musa",
  },
];

interface StoredCell {
  score: string | null;
  absent: boolean;
  /** When the cell was last written (the client time when it came from a queue). Last write wins (ADR 0023). */
  updatedAt: string;
}

export interface StoredSheet {
  id: string;
  termId: string;
  classArmId: string;
  subjectId: string;
  status: "Draft" | "Submitted" | "Approved";
  submittedAt: string | null;
  approvedAt: string | null;
  cells: Map<string, StoredCell>;
}

const sheets = new Map<string, StoredSheet>();
const cellKey = (studentId: string, componentId: string) => `${studentId}|${componentId}`;
const sheetKey = (termId: string, armId: string, subjectId: string) =>
  `${termId}|${armId}|${subjectId}`;

// The labels that may enter scores, and those that may approve (the fake's account labels, see fake-api.ts /me).
const CAN_ENTER = new Set(["admin", "teacher"]);
const CAN_APPROVE = new Set(["admin", "approver"]);

function view(sheet: StoredSheet, components: AssessmentCall["components"]) {
  const subjectName = "Mathematics";
  return {
    id: sheet.id,
    termId: sheet.termId,
    classArmId: sheet.classArmId,
    subjectId: sheet.subjectId,
    subjectName,
    status: sheet.status,
    students: STUDENTS.map((s) => ({
      ...s,
      cells: components.map((c) => {
        const cell = sheet.cells.get(cellKey(s.studentId, c.id)) ?? { score: null, absent: false };
        return { componentId: c.id, score: cell.score, absent: cell.absent };
      }),
    })),
    submittedAt: sheet.submittedAt,
    approvedAt: sheet.approvedAt,
  };
}

/** Scores in tenths; a score with more than one decimal, a sign or text is a format problem. */
function parseTenths(text: string): number | "format" | null {
  const s = text.trim();
  if (s === "") return null;
  const m = /^(\d+)(?:\.(\d))?$/.exec(s);
  if (!m) return "format";
  return Number(m[1]) * 10 + (m[2] === undefined ? 0 : Number(m[2]));
}

export const ASSESSMENT_SHEET_ID = "0190a6c2-0000-7000-8000-000000000c01";

/** Every sheet, for the results double. */
export function allSheets(): StoredSheet[] {
  return [...sheets.values()];
}

export function sheetStudents() {
  return STUDENTS;
}

/** One blank draft sheet for the current term, so the browser journeys start from a sheet that exists (the fake resets per run). */
function seedTerms(termIds: readonly string[]) {
  // Every term of the session gets its sheet: other journeys change which term is current, and the screens follow it.
  termIds.forEach((termId, i) => {
    const key = sheetKey(termId, ASSESSMENT_ARM, ASSESSMENT_SUBJECT);
    if (sheets.has(key)) return;
    sheets.set(key, {
      id:
        i === 0
          ? ASSESSMENT_SHEET_ID
          : `0190a6c2-0000-7000-8000-${String(0xc00 + i).padStart(12, "0")}`,
      termId,
      classArmId: ASSESSMENT_ARM,
      subjectId: ASSESSMENT_SUBJECT,
      status: "Draft",
      submittedAt: null,
      approvedAt: null,
      cells: new Map(),
    });
  });
}

export function handleAssessment(call: AssessmentCall): boolean {
  const { method, path, url, body, res, send, label, components } = call;
  seedTerms(call.termIds ?? []);

  if (path === "/api/v1/me/assignments" && method === "GET") {
    const assignments =
      label === "admin" || label === "teacher"
        ? [
            {
              id: "0190a6c2-0000-7000-8000-000000000a01",
              classArmId: ASSESSMENT_ARM,
              subjectId: ASSESSMENT_SUBJECT,
              isFormTeacher: false,
            },
          ]
        : [];
    send(res, 200, { sessionId: ASSESSMENT_SESSION, assignments });
    return true;
  }

  if (path === "/api/v1/assessment/score-sheets" && method === "GET") {
    if (!CAN_ENTER.has(label) && !CAN_APPROVE.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const key = sheetKey(
      url.searchParams.get("termId") ?? "",
      url.searchParams.get("classArmId") ?? "",
      url.searchParams.get("subjectId") ?? "",
    );
    const sheet = sheets.get(key);
    if (!sheet)
      return (
        send(res, 404, problem(404, "assessment.sheet_not_found", "Score sheet not found")),
        true
      );
    send(res, 200, view(sheet, components));
    return true;
  }

  if (path === "/api/v1/assessment/score-sheets" && method === "POST") {
    if (!CAN_ENTER.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const termId = String(body.termId ?? "");
    const classArmId = String(body.classArmId ?? "");
    const subjectId = String(body.subjectId ?? "");
    const key = sheetKey(termId, classArmId, subjectId);
    if (sheets.has(key))
      return (
        send(res, 409, problem(409, "assessment.sheet_exists", "A score sheet already exists")),
        true
      );
    const sheet: StoredSheet = {
      id: `0190a6c2-0000-7000-8000-${String(sheets.size + 0xb01).padStart(12, "0")}`,
      termId,
      classArmId,
      subjectId,
      status: "Draft",
      submittedAt: null,
      approvedAt: null,
      cells: new Map(),
    };
    sheets.set(key, sheet);
    send(res, 201, view(sheet, components));
    return true;
  }

  const scores = /^\/api\/v1\/assessment\/score-sheets\/([^/]+)\/scores$/.exec(path);
  if (scores && method === "PUT") {
    if (!CAN_ENTER.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const sheet = [...sheets.values()].find((s) => s.id === scores[1]);
    if (!sheet)
      return (
        send(res, 404, problem(404, "assessment.sheet_not_found", "Score sheet not found")),
        true
      );
    if (sheet.status !== "Draft")
      return (
        send(res, 422, problem(422, "assessment.not_draft", "The sheet is not a draft")),
        true
      );
    const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : [];
    const outcomes = rows.map((row) => {
      const studentId = String(row.studentId ?? "");
      const componentId = String(row.componentId ?? "");
      const absent = row.absent === true;
      const score = row.score === null || row.score === undefined ? "" : String(row.score);
      const component = components.find((c) => c.id === componentId);
      const known = STUDENTS.some((s) => s.studentId === studentId) && component !== undefined;
      const clientAt = typeof row.clientUpdatedAt === "string" ? row.clientUpdatedAt : null;
      const stored = sheet.cells.get(cellKey(studentId, componentId));
      if (known && clientAt && stored && stored.updatedAt > clientAt)
        return { studentId, componentId, result: "IgnoredNewerExists", reason: null };
      if (!known)
        return {
          studentId,
          componentId,
          result: "rejected",
          reason: "unknown student or component",
        };
      const tenths = parseTenths(score);
      if (absent && tenths !== null)
        return {
          studentId,
          componentId,
          result: "rejected",
          reason: "an absent student has no score",
        };
      if (tenths === "format")
        return {
          studentId,
          componentId,
          result: "rejected",
          reason: "use at most one decimal place",
        };
      if (tenths !== null && component && tenths > component.maxScore * 10)
        return {
          studentId,
          componentId,
          result: "rejected",
          reason: `above the maximum of ${component.maxScore}`,
        };
      sheet.cells.set(cellKey(studentId, componentId), {
        score: absent || tenths === null ? null : score.trim(),
        absent,
        updatedAt: clientAt ?? new Date().toISOString(),
      });
      return { studentId, componentId, result: "applied", reason: null };
    });
    const applied = outcomes.filter((o) => o.result === "applied").length;
    const ignored = outcomes.filter((o) => o.result === "IgnoredNewerExists").length;
    const rejected = outcomes.length - applied - ignored;
    send(res, 200, {
      sheetId: sheet.id,
      status: sheet.status,
      applied,
      ignored,
      rejected,
      rows: outcomes,
    });
    return true;
  }

  const submit = /^\/api\/v1\/assessment\/score-sheets\/([^/]+)\/submit$/.exec(path);
  if (submit && method === "POST") {
    if (!CAN_ENTER.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const sheet = [...sheets.values()].find((s) => s.id === submit[1]);
    if (!sheet)
      return (
        send(res, 404, problem(404, "assessment.sheet_not_found", "Score sheet not found")),
        true
      );
    if (sheet.status !== "Draft")
      return (
        send(res, 422, problem(422, "assessment.not_draft", "The sheet is not a draft")),
        true
      );
    sheet.status = "Submitted";
    sheet.submittedAt = new Date().toISOString();
    send(res, 200, view(sheet, components));
    return true;
  }

  const approve = /^\/api\/v1\/assessment\/score-sheets\/([^/]+)\/approve$/.exec(path);
  if (approve && method === "POST") {
    if (!CAN_APPROVE.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const sheet = [...sheets.values()].find((s) => s.id === approve[1]);
    if (!sheet)
      return (
        send(res, 404, problem(404, "assessment.sheet_not_found", "Score sheet not found")),
        true
      );
    if (sheet.status !== "Submitted")
      return (
        send(res, 422, problem(422, "assessment.not_submitted", "The sheet is not submitted")),
        true
      );
    sheet.status = "Approved";
    sheet.approvedAt = new Date().toISOString();
    send(res, 200, view(sheet, components));
    return true;
  }

  const reopen = /^\/api\/v1\/assessment\/score-sheets\/([^/]+)\/reopen$/.exec(path);
  if (reopen && method === "POST") {
    if (!CAN_APPROVE.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const sheet = [...sheets.values()].find((s) => s.id === reopen[1]);
    if (!sheet)
      return (
        send(res, 404, problem(404, "assessment.sheet_not_found", "Score sheet not found")),
        true
      );
    if (sheet.status === "Draft")
      return (
        send(res, 422, problem(422, "assessment.cannot_reopen", "The sheet cannot be reopened")),
        true
      );
    sheet.status = "Draft";
    sheet.submittedAt = null;
    sheet.approvedAt = null;
    send(res, 200, view(sheet, components));
    return true;
  }

  return false;
}
