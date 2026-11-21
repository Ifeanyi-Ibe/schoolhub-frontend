// Test double for the staff area: records, assignments, leave and invitations. The main fake (fake-api.ts) validates
// every request against the contract, then calls handleStaff, which answers the contract's operations. Identifiers
// are fixed; state is in memory and resets with the run.
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface StaffCall {
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

const CLASS_ARM_ID = "0190a6c2-0000-7000-8000-000000000401";
const SESSION_ID = "0190a6c2-0000-7000-8000-000000000801";
const SUBJECT_ID = "0190a6c2-0000-7000-8000-000000000401";

interface StaffRecord {
  id: string;
  staffNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  email: string | null;
  address: string | null;
  staffType: string;
  jobTitle: string;
  department: string | null;
  employmentType: string;
  hireDate: string;
  status: string;
  rowVersion: number;
}

interface AssignmentRow {
  id: string;
  classArmId: string;
  subjectId: string | null;
  isFormTeacher: boolean;
}

interface LeaveRow {
  id: string;
  staffId: string;
  leaveType: string;
  startsOn: string;
  endsOn: string;
  status: string;
  decidedAt: string | null;
}

const SEED_STAFF: StaffRecord[] = [
  {
    id: "0190a6c2-0000-7000-8000-000000000a01",
    staffNo: "STF-0001",
    firstName: "Ngozi",
    middleName: null,
    lastName: "Eze",
    gender: "Female",
    dateOfBirth: "1990-04-12",
    phone: "08033334444",
    email: null,
    address: null,
    staffType: "Teaching",
    jobTitle: "Mathematics teacher",
    department: "Sciences",
    employmentType: "FullTime",
    hireDate: "2024-09-02",
    status: "Active",
    rowVersion: 1,
  },
  {
    id: "0190a6c2-0000-7000-8000-000000000a02",
    staffNo: "STF-0002",
    firstName: "Tunde",
    middleName: null,
    lastName: "Bello",
    gender: "Male",
    dateOfBirth: "1984-11-30",
    phone: "08055556666",
    email: "tunde.bello@example.test",
    address: null,
    staffType: "Admin",
    jobTitle: "Bursar",
    department: "Administration",
    employmentType: "FullTime",
    hireDate: "2019-01-14",
    status: "Active",
    rowVersion: 1,
  },
];

const staffById = new Map<string, StaffRecord>(SEED_STAFF.map((s) => [s.id, { ...s }]));
const assignmentsByKey = new Map<string, AssignmentRow[]>([
  [
    `${SEED_STAFF[0]!.id}|${SESSION_ID}`,
    [
      {
        id: "0190a6c2-0000-7000-8000-000000000b01",
        classArmId: CLASS_ARM_ID,
        subjectId: null,
        isFormTeacher: true,
      },
    ],
  ],
]);
const leaveByStaff = new Map<string, LeaveRow[]>([
  [
    SEED_STAFF[0]!.id,
    [
      {
        id: "0190a6c2-0000-7000-8000-000000000c01",
        staffId: SEED_STAFF[0]!.id,
        leaveType: "Annual",
        startsOn: "2026-12-01",
        endsOn: "2026-12-05",
        status: "Requested",
        decidedAt: null,
      },
    ],
  ],
]);
let staffNumber = SEED_STAFF.length;

function staffNameOf(s: StaffRecord): string {
  return [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
}

function listItem(s: StaffRecord) {
  return {
    id: s.id,
    staffNo: s.staffNo,
    fullName: staffNameOf(s),
    staffType: s.staffType,
    jobTitle: s.jobTitle,
    status: s.status,
  };
}

function viewOf(s: StaffRecord) {
  return { ...s };
}

function body2record(
  body: Record<string, unknown>,
): Omit<StaffRecord, "id" | "staffNo" | "status" | "rowVersion"> {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : null);
  return {
    firstName: str("firstName") ?? "",
    middleName: str("middleName"),
    lastName: str("lastName") ?? "",
    gender: str("gender") ?? "",
    dateOfBirth: str("dateOfBirth") ?? "",
    phone: str("phone") ?? "",
    email: str("email"),
    address: str("address"),
    staffType: str("staffType") ?? "",
    jobTitle: str("jobTitle") ?? "",
    department: str("department"),
    employmentType: str("employmentType") ?? "",
    hireDate: str("hireDate") ?? "",
  };
}

/** Answers the staff operations. Returns false for paths it does not own, so the caller can try the next handler. */
export function handleStaff(call: StaffCall): boolean {
  const { method, path, url, body, res, send } = call;

  if (path === "/api/v1/staff" && method === "GET") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const type = url.searchParams.get("staffType") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") ?? "20"));
    const all = [...staffById.values()]
      .filter(
        (s) =>
          q === "" ||
          staffNameOf(s).toLowerCase().includes(q) ||
          s.staffNo.toLowerCase().includes(q),
      )
      .filter((s) => type === "" || s.staffType === type)
      .filter((s) => status === "" || s.status === status)
      .sort((a, b) => a.staffNo.localeCompare(b.staffNo));
    const items = all.slice((page - 1) * pageSize, page * pageSize).map(listItem);
    send(res, 200, {
      items,
      page,
      pageSize,
      totalCount: all.length,
      totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
    });
    return true;
  }

  if (path === "/api/v1/staff" && method === "POST") {
    staffNumber += 1;
    const record: StaffRecord = {
      id: randomUUID(),
      staffNo: `STF-${String(staffNumber).padStart(4, "0")}`,
      status: "Active",
      rowVersion: 1,
      ...body2record(body),
    };
    staffById.set(record.id, record);
    send(res, 201, viewOf(record));
    return true;
  }

  const one = /^\/api\/v1\/staff\/([^/]+)$/.exec(path);
  if (one) {
    const record = staffById.get(one[1]!);
    if (!record) {
      send(res, 404, problem(404, "staff.not_found", "Not found"));
      return true;
    }
    if (method === "GET") {
      send(res, 200, viewOf(record));
      return true;
    }
    if (method === "PUT") {
      const next = { ...record, ...body2record(body), rowVersion: record.rowVersion + 1 };
      staffById.set(record.id, next);
      send(res, 200, viewOf(next));
      return true;
    }
  }

  const action =
    /^\/api\/v1\/staff\/([^/]+)\/(deactivate|reactivate|invite-user|assignments|leave)$/.exec(path);
  if (action) {
    const [, id = "", op = ""] = action;
    const record = staffById.get(id);
    if (!record) {
      send(res, 404, problem(404, "staff.not_found", "Not found"));
      return true;
    }
    if (op === "deactivate" && method === "POST") {
      const next = { ...record, status: "Resigned", rowVersion: record.rowVersion + 1 };
      staffById.set(id, next);
      send(res, 200, viewOf(next));
      return true;
    }
    if (op === "reactivate" && method === "POST") {
      const next = { ...record, status: "Active", rowVersion: record.rowVersion + 1 };
      staffById.set(id, next);
      send(res, 200, viewOf(next));
      return true;
    }
    if (op === "invite-user" && method === "POST") {
      const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      send(res, 202, { userId: randomUUID(), expiresAt: expires });
      return true;
    }
    if (op === "assignments") {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      const key = `${id}|${sessionId}`;
      if (method === "GET") {
        send(res, 200, assignmentsByKey.get(key) ?? []);
        return true;
      }
      if (method === "PUT") {
        const rows = (Array.isArray(body) ? body : []) as unknown as Array<{
          classArmId: string;
          subjectId: string | null;
          isFormTeacher: boolean;
        }>;
        // A class arm has one form teacher in a session: refuse when another staff member already holds it.
        for (const row of rows.filter((r) => r.isFormTeacher)) {
          for (const [otherKey, otherRows] of assignmentsByKey) {
            if (otherKey === key || !otherKey.endsWith(`|${sessionId}`)) continue;
            if (otherRows.some((o) => o.isFormTeacher && o.classArmId === row.classArmId)) {
              send(res, 409, problem(409, "staff.form_teacher_taken", "Form teacher already set"));
              return true;
            }
          }
        }
        const saved = rows.map((r) => ({
          id: randomUUID(),
          classArmId: r.classArmId,
          subjectId: r.subjectId,
          isFormTeacher: r.isFormTeacher,
        }));
        assignmentsByKey.set(key, saved);
        send(res, 200, saved);
        return true;
      }
    }
    if (op === "leave") {
      if (method === "GET") {
        send(res, 200, leaveByStaff.get(id) ?? []);
        return true;
      }
      if (method === "POST") {
        const row: LeaveRow = {
          id: randomUUID(),
          staffId: id,
          leaveType: typeof body["leaveType"] === "string" ? (body["leaveType"] as string) : "",
          startsOn: typeof body["startsOn"] === "string" ? (body["startsOn"] as string) : "",
          endsOn: typeof body["endsOn"] === "string" ? (body["endsOn"] as string) : "",
          status: "Requested",
          decidedAt: null,
        };
        leaveByStaff.set(id, [...(leaveByStaff.get(id) ?? []), row]);
        send(res, 201, row);
        return true;
      }
    }
  }

  const decide = /^\/api\/v1\/leave\/([^/]+)\/(approve|reject)$/.exec(path);
  if (decide && method === "POST") {
    const [, leaveId = "", op = ""] = decide;
    for (const [staffId, rows] of leaveByStaff) {
      const row = rows.find((r) => r.id === leaveId);
      if (!row) continue;
      if (row.decidedAt !== null) {
        send(res, 409, problem(409, "staff.leave_decided", "Already decided"));
        return true;
      }
      const next: LeaveRow = {
        ...row,
        status: op === "approve" ? "Approved" : "Rejected",
        decidedAt: new Date().toISOString(),
      };
      leaveByStaff.set(
        staffId,
        rows.map((r) => (r.id === leaveId ? next : r)),
      );
      send(res, 200, next);
      return true;
    }
    send(res, 404, problem(404, "leave.not_found", "Not found"));
    return true;
  }

  const armTeachers = /^\/api\/v1\/class-arms\/([^/]+)\/teachers$/.exec(path);
  if (armTeachers && method === "GET") {
    const armId = armTeachers[1] ?? "";
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const teachers = [...assignmentsByKey.entries()]
      .filter(([key]) => key.endsWith(`|${sessionId}`))
      .flatMap(([key, rows]) =>
        rows
          .filter((r) => r.classArmId === armId)
          .map((r) => {
            const staffId = key.split("|")[0] ?? "";
            const s = staffById.get(staffId);
            return {
              staffId,
              staffNo: s?.staffNo ?? "",
              fullName: s ? staffNameOf(s) : "",
              subjectId: r.subjectId,
              isFormTeacher: r.isFormTeacher,
            };
          }),
      );
    send(res, 200, teachers);
    return true;
  }

  if (path === "/api/v1/me/assignments" && method === "GET") {
    const sessionId = url.searchParams.get("sessionId");
    send(res, 200, {
      sessionId: sessionId ?? SESSION_ID,
      assignments: [
        {
          id: "0190a6c2-0000-7000-8000-000000000b09",
          classArmId: CLASS_ARM_ID,
          subjectId: SUBJECT_ID,
          isFormTeacher: false,
        },
      ],
    });
    return true;
  }

  return false;
}
