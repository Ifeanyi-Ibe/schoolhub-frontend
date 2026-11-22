// Test double for attendance: the register, submit and reopen, the absentees and the summaries, and the term export.
// It keeps the contract's rules that the screens depend on: last writer wins by clientUpdatedAt, a refused student, a
// locked register on a fixed date, and a reason for reopening. State is in memory and resets with the run.
import type { ServerResponse } from "node:http";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface AttendanceCall {
  method: string;
  path: string;
  url: URL;
  body: Record<string, unknown>;
  res: ServerResponse;
  send: Send;
}

const problem = (status: number, code: string, title: string) => ({
  type: `urn:schoolhub:error:${code}`,
  title,
  status,
  detail: title,
  code,
});

export const ATTENDANCE_ARM = "0190a6c2-0000-7000-8000-000000000401";
export const LOCKED_DATES = ["2026-09-29", "2026-09-30"];
/** A student the double refuses on every save: the screens must show the reason and keep the mark. */
export const REFUSED_STUDENT = "0190a6c2-0000-7000-8000-000000000e03";

const STUDENTS = [
  {
    studentId: "0190a6c2-0000-7000-8000-000000000e01",
    admissionNo: "GFA/0101",
    fullName: "Ada Okafor",
  },
  {
    studentId: "0190a6c2-0000-7000-8000-000000000e02",
    admissionNo: "GFA/0102",
    fullName: "Bola Musa",
  },
  { studentId: REFUSED_STUDENT, admissionNo: "GFA/0103", fullName: "Refused Pupil" },
];

interface Mark {
  status: string;
  arrivalTime: string | null;
  clientUpdatedAt: string;
}

interface Register {
  marks: Map<string, Mark>;
  submitted: boolean;
  locked: boolean;
}

const registers = new Map<string, Register>();

function registerFor(date: string): Register {
  const key = `${ATTENDANCE_ARM}|${date}`;
  let r = registers.get(key);
  if (!r) {
    r = { marks: new Map(), submitted: false, locked: LOCKED_DATES.includes(date) };
    registers.set(key, r);
  }
  return r;
}

function statusOf(reg: Register, studentId: string) {
  const m = reg.marks.get(studentId);
  return {
    status: m?.status ?? null,
    arrivalTime: m?.arrivalTime ?? null,
    clientUpdatedAt: m?.clientUpdatedAt ?? null,
  };
}

function sessionStatus(reg: Register): string {
  if (reg.locked) return "Locked";
  return reg.submitted ? "Submitted" : "Open";
}

/** Answers the attendance operations. Returns false for paths it does not own. */
export function handleAttendance(call: AttendanceCall): boolean {
  const { method, path, url, body, res, send } = call;

  const register = /^\/api\/v1\/attendance\/class-arms\/([^/]+)$/.exec(path);
  if (register && method === "GET") {
    const date = url.searchParams.get("date") ?? "";
    const reg = registerFor(date);
    send(res, 200, {
      classArmId: ATTENDANCE_ARM,
      date,
      period: null,
      isSchoolDay: true,
      sessionStatus: sessionStatus(reg),
      locked: reg.locked,
      students: STUDENTS.map((s) => ({ ...s, ...statusOf(reg, s.studentId), note: null })),
    });
    return true;
  }

  const save = /^\/api\/v1\/attendance\/class-arms\/([^/]+)\/([^/]+)$/.exec(path);
  if (save && method === "PUT") {
    const date = save[2] ?? "";
    const reg = registerFor(date);
    if (reg.locked) {
      send(res, 409, problem(409, "attendance.register_locked", "The register is locked."));
      return true;
    }
    const entries = (Array.isArray(body["entries"]) ? body["entries"] : []) as Array<{
      studentId: string;
      status: string;
      arrivalTime: string | null;
      clientId: string;
      clientUpdatedAt: string;
    }>;
    const rows: Array<{
      studentId: string;
      clientId: string;
      result: string;
      reason: string | null;
    }> = [];
    let applied = 0;
    let ignored = 0;
    let rejected = 0;
    for (const e of entries) {
      if (e.studentId === REFUSED_STUDENT) {
        rows.push({
          studentId: e.studentId,
          clientId: e.clientId,
          result: "rejected",
          reason: "Not enrolled in this class.",
        });
        rejected += 1;
        continue;
      }
      const current = reg.marks.get(e.studentId);
      if (current && current.clientUpdatedAt > e.clientUpdatedAt) {
        rows.push({
          studentId: e.studentId,
          clientId: e.clientId,
          result: "ignored_newer_exists",
          reason: null,
        });
        ignored += 1;
        continue;
      }
      reg.marks.set(e.studentId, {
        status: e.status,
        arrivalTime: e.arrivalTime,
        clientUpdatedAt: e.clientUpdatedAt,
      });
      rows.push({ studentId: e.studentId, clientId: e.clientId, result: "applied", reason: null });
      applied += 1;
    }
    send(res, 200, {
      sessionId: `${ATTENDANCE_ARM}|${date}`,
      date,
      period: null,
      sessionStatus: sessionStatus(reg),
      applied,
      ignored,
      rejected,
      rows,
    });
    return true;
  }

  const submit = /^\/api\/v1\/attendance\/class-arms\/([^/]+)\/([^/]+)\/submit$/.exec(path);
  if (submit && method === "POST") {
    const reg = registerFor(submit[2] ?? "");
    if (reg.locked) {
      send(res, 409, problem(409, "attendance.register_locked", "The register is locked."));
      return true;
    }
    const alreadySubmitted = reg.submitted;
    reg.submitted = true;
    const alertsRaised = [...reg.marks.values()].filter((m) => m.status === "Absent").length;
    send(res, 200, {
      sessionId: `${ATTENDANCE_ARM}|${submit[2]}`,
      sessionStatus: sessionStatus(reg),
      alertsRaised,
      alreadySubmitted,
    });
    return true;
  }

  const reopen = /^\/api\/v1\/attendance\/class-arms\/([^/]+)\/([^/]+)\/reopen$/.exec(path);
  if (reopen && method === "POST") {
    const reg = registerFor(reopen[2] ?? "");
    if (typeof body["reason"] !== "string" || body["reason"].trim() === "") {
      send(res, 422, problem(422, "validation.failed", "A reason is required."));
      return true;
    }
    reg.locked = false;
    reg.submitted = false;
    send(res, 200, { sessionId: `${ATTENDANCE_ARM}|${reopen[2]}`, sessionStatus: "Open" });
    return true;
  }

  if (path === `/api/v1/attendance/class-arms/${ATTENDANCE_ARM}/absentees` && method === "GET") {
    const reg = registerFor(url.searchParams.get("date") ?? "");
    send(
      res,
      200,
      STUDENTS.filter((s) => reg.marks.get(s.studentId)?.status === "Absent").map((s) => ({
        studentId: s.studentId,
        admissionNo: s.admissionNo,
        fullName: s.fullName,
        period: null,
        note: null,
      })),
    );
    return true;
  }

  if (
    path === `/api/v1/attendance/class-arms/${ATTENDANCE_ARM}/class-summary` &&
    method === "GET"
  ) {
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const days = [...registers.entries()]
      .filter(([key]) => key.startsWith(`${ATTENDANCE_ARM}|`))
      .map(([key, reg]) => {
        const date = key.split("|")[1] ?? "";
        const marks = [...reg.marks.values()];
        return {
          date,
          present: marks.filter((m) => m.status === "Present").length,
          absent: marks.filter((m) => m.status === "Absent").length,
          late: marks.filter((m) => m.status === "Late").length,
          excused: marks.filter((m) => m.status === "Excused").length,
          unmarked: STUDENTS.length - marks.length,
        };
      })
      .filter((d) => d.date >= from && d.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
    send(res, 200, { classArmId: ATTENDANCE_ARM, from, to, days });
    return true;
  }

  if (path === `/api/v1/attendance/class-arms/${ATTENDANCE_ARM}/term-summary` && method === "GET") {
    const termId = url.searchParams.get("termId") ?? "";
    const reg = registerFor("2026-11-02");
    send(res, 200, {
      classArmId: ATTENDANCE_ARM,
      termId,
      students: STUDENTS.map((s) => {
        const status = reg.marks.get(s.studentId)?.status;
        const present = status === "Present" ? 1 : 0;
        const absent = status === "Absent" ? 1 : 0;
        const total = present + absent;
        return {
          studentId: s.studentId,
          admissionNo: s.admissionNo,
          fullName: s.fullName,
          summary: {
            present,
            absent,
            late: 0,
            excused: 0,
            schoolDaysElapsed: total,
            rate: total === 0 ? null : (present / total) * 100,
          },
        };
      }),
    });
    return true;
  }

  if (
    path === `/api/v1/attendance/class-arms/${ATTENDANCE_ARM}/term-summary.xlsx` &&
    method === "GET"
  ) {
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="term-summary.xlsx"',
    });
    res.end("PK fake spreadsheet");
    return true;
  }

  return false;
}
