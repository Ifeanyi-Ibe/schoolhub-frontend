// Test double for the students area: records, guardians, documents, notes, files, bulk import and promotions.
// The main fake (fake-api.ts) validates every request against the contract, then calls handleStudents, which
// answers the contract's operations. Identifiers are fixed; state is in memory and resets with the run.
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface StudentsCall {
  method: string;
  path: string;
  url: URL;
  body: Record<string, unknown>;
  res: ServerResponse;
  send: Send;
}

const problem = (
  status: number,
  code: string,
  title: string,
  errors?: Record<string, string[]>,
) => ({
  type: `urn:schoolhub:error:${code}`,
  title,
  status,
  detail: title,
  code,
  ...(errors ? { errors } : {}),
});

interface Guardian {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  relationship: string;
  isPrimaryPayer: boolean;
  isEmergencyContact: boolean;
  canPickup: boolean;
  priority: number;
}
interface Student {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: "Female" | "Male";
  dateOfBirth: string;
  address: string | null;
  status: string;
  admittedOn: string;
  currentClassArmId: string | null;
  rowVersion: number;
  medicalNotes: string | null;
  specialNeedsNotes: string | null;
  guardians: Guardian[];
  enrolments: Array<{
    id: string;
    sessionId: string;
    classArmId: string;
    status: string;
    startsOn: string;
    endsOn: string | null;
  }>;
}
interface Doc {
  id: string;
  fileId: string;
  type: string;
  notes: string | null;
  createdAt: string;
}
interface Note {
  id: string;
  category: string;
  text: string;
  createdAt: string;
}

const SESSION = "0190a6c2-0000-7000-8000-000000000801";
const ARM = "0190a6c2-0000-7000-8000-000000000321";

export const STUDENTS: Student[] = [
  {
    id: "0190a6c2-0000-7000-8000-000000000901",
    admissionNo: "GFA/0001",
    firstName: "Chinedu",
    middleName: null,
    lastName: "Nwosu",
    gender: "Male",
    dateOfBirth: "2014-03-02",
    address: "4 Marina Close, Lagos",
    status: "Active",
    admittedOn: "2025-09-08",
    currentClassArmId: ARM,
    rowVersion: 1,
    medicalNotes: null,
    specialNeedsNotes: null,
    guardians: [
      {
        id: "0190a6c2-0000-7000-8000-000000000951",
        firstName: "Ngozi",
        lastName: "Nwosu",
        phone: "+2348011111111",
        email: "ngozi.parent@test.invalid",
        relationship: "Mother",
        isPrimaryPayer: true,
        isEmergencyContact: true,
        canPickup: true,
        priority: 1,
      },
    ],
    enrolments: [
      {
        id: "0190a6c2-0000-7000-8000-000000000961",
        sessionId: SESSION,
        classArmId: ARM,
        status: "Active",
        startsOn: "2025-09-08",
        endsOn: null,
      },
    ],
  },
  {
    id: "0190a6c2-0000-7000-8000-000000000902",
    admissionNo: "GFA/0002",
    firstName: "Amara",
    middleName: "Ije",
    lastName: "Eze",
    gender: "Female",
    dateOfBirth: "2013-07-19",
    address: null,
    status: "Applicant",
    admittedOn: "2026-09-07",
    currentClassArmId: null,
    rowVersion: 1,
    medicalNotes: null,
    specialNeedsNotes: null,
    guardians: [],
    enrolments: [],
  },
];

const DOCUMENTS = new Map<string, Doc[]>();
const NOTES = new Map<string, Note[]>();
const FILES = new Map<
  string,
  { contentType: string; sizeBytes: number; originalName: string; status: string; bytes: number }
>();
const IMPORTS = new Map<
  string,
  {
    status: string;
    rows: Array<{ rowNumber: number; status: string; errors: string[] }>;
    createdRows: number;
  }
>();

function findStudent(id: string | undefined): Student | undefined {
  return STUDENTS.find((s) => s.id === id);
}

function view(s: Student) {
  return { ...s, guardians: s.guardians, enrolments: s.enrolments };
}

function listItem(s: Student) {
  return {
    id: s.id,
    admissionNo: s.admissionNo,
    fullName: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" "),
    gender: s.gender,
    status: s.status,
    currentClassArmId: s.currentClassArmId,
  };
}

const IMPORT_TEMPLATE = "firstName,middleName,lastName,gender,dateOfBirth,admissionNo\n";

/** Answers the students operations. Returns false when the path is not one of them. */
export function handleStudents(call: StudentsCall): boolean {
  const { method, path, url, body, res, send } = call;
  const sid = (re: RegExp) => re.exec(path)?.[1];

  // Students: list, register, read, update, delete, lifecycle.
  if (path === "/api/v1/students" && method === "GET") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const status = url.searchParams.get("status");
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
    const matched = STUDENTS.filter(
      (s) =>
        (q === "" || `${s.firstName} ${s.lastName} ${s.admissionNo}`.toLowerCase().includes(q)) &&
        (status === null || status === "" || s.status === status),
    );
    const items = matched.slice((page - 1) * pageSize, page * pageSize).map(listItem);
    send(res, 200, {
      items,
      page,
      pageSize,
      totalCount: matched.length,
      totalPages: Math.max(1, Math.ceil(matched.length / pageSize)),
    });
    return true;
  }

  if (path === "/api/v1/students" && method === "POST") {
    const first = String(body.firstName ?? "").trim();
    const last = String(body.lastName ?? "").trim();
    const dob = String(body.dateOfBirth ?? "");
    const allowDuplicate = call.url.searchParams.get("allowDuplicate") === "true";
    const match = STUDENTS.find(
      (s) => s.firstName === first && s.lastName === last && s.dateOfBirth === dob,
    );
    if (match && !allowDuplicate) {
      send(
        res,
        409,
        problem(
          409,
          "students.possible_duplicate",
          "A student with the same name and date of birth already exists.",
          { candidateIds: [match.id] },
        ),
        {
          "Content-Type": "application/problem+json",
        },
      );
      return true;
    }
    const guardians: Guardian[] = (
      Array.isArray(body.guardians) ? (body.guardians as Array<Record<string, unknown>>) : []
    ).map((g, i) => ({
      id: randomUUID(),
      firstName: String(g.firstName),
      lastName: String(g.lastName),
      phone: String(g.phone),
      email: (g.email as string | null) ?? null,
      relationship: String(g.relationship),
      isPrimaryPayer: Boolean(g.isPrimaryPayer),
      isEmergencyContact: Boolean(g.isEmergencyContact),
      canPickup: Boolean(g.canPickup),
      priority: Number(g.priority ?? i + 1),
    }));
    const student: Student = {
      id: randomUUID(),
      admissionNo:
        (body.admissionNo as string | null) ??
        `GFA/${String(STUDENTS.length + 1).padStart(4, "0")}`,
      firstName: first,
      middleName: (body.middleName as string | null) ?? null,
      lastName: last,
      gender: body.gender as "Female" | "Male",
      dateOfBirth: dob,
      address: (body.address as string | null) ?? null,
      status: "Active",
      admittedOn: String(body.admittedOn),
      currentClassArmId: String(body.classArmId),
      rowVersion: 1,
      medicalNotes: (body.medicalNotes as string | null) ?? null,
      specialNeedsNotes: (body.specialNeedsNotes as string | null) ?? null,
      guardians,
      enrolments: [
        {
          id: randomUUID(),
          sessionId: String(body.sessionId),
          classArmId: String(body.classArmId),
          status: "Active",
          startsOn: String(body.admittedOn),
          endsOn: null,
        },
      ],
    };
    STUDENTS.push(student);
    send(res, 201, { student: view(student), capacityWarning: false });
    return true;
  }

  // "import" is a path segment of the bulk import, not a student identifier.
  const one = path.startsWith("/api/v1/students/import")
    ? undefined
    : sid(/^\/api\/v1\/students\/([^/]+)$/);
  if (one !== undefined) {
    const s = findStudent(one);
    if (!s) {
      send(res, 404, problem(404, "students.not_found", "Student not found"));
      return true;
    }
    if (method === "GET") {
      send(res, 200, view(s));
      return true;
    }
    if (method === "PATCH") {
      for (const key of [
        "firstName",
        "middleName",
        "lastName",
        "gender",
        "dateOfBirth",
        "address",
        "medicalNotes",
        "specialNeedsNotes",
      ] as const) {
        if (key in body) (s as unknown as Record<string, unknown>)[key] = body[key] ?? null;
      }
      s.rowVersion += 1;
      send(res, 200, view(s));
      return true;
    }
    if (method === "DELETE") {
      STUDENTS.splice(STUDENTS.indexOf(s), 1);
      res.writeHead(204).end();
      return true;
    }
  }

  const lifecycle =
    /^\/api\/v1\/students\/([^/]+)\/(withdraw|graduate|reinstate|transfer-arm)$/.exec(path);
  if (lifecycle && method === "POST") {
    const s = findStudent(lifecycle[1]);
    if (!s) {
      send(res, 404, problem(404, "students.not_found", "Student not found"));
      return true;
    }
    if (lifecycle[2] === "withdraw") s.status = String(body.status ?? "Withdrawn");
    if (lifecycle[2] === "graduate") s.status = "Graduated";
    if (lifecycle[2] === "reinstate") {
      s.status = "Active";
      s.currentClassArmId = String(body.classArmId);
    }
    if (lifecycle[2] === "transfer-arm") s.currentClassArmId = String(body.classArmId);
    s.rowVersion += 1;
    send(res, 200, view(s));
    return true;
  }

  // Guardians: add to a student, change the link, remove the link, contact details, portal invite.
  const addGuardian = /^\/api\/v1\/students\/([^/]+)\/guardians$/.exec(path);
  if (addGuardian && method === "POST") {
    const s = findStudent(addGuardian[1]);
    if (!s) return (send(res, 404, problem(404, "students.not_found", "Student not found")), true);
    const g: Guardian = {
      id: randomUUID(),
      firstName: String(body.firstName),
      lastName: String(body.lastName),
      phone: String(body.phone),
      email: (body.email as string | null) ?? null,
      relationship: String(body.relationship),
      isPrimaryPayer: Boolean(body.isPrimaryPayer),
      isEmergencyContact: Boolean(body.isEmergencyContact),
      canPickup: Boolean(body.canPickup),
      priority: Number(body.priority),
    };
    s.guardians.push(g);
    send(res, 201, g);
    return true;
  }
  const link = /^\/api\/v1\/students\/([^/]+)\/guardians\/([^/]+)$/.exec(path);
  if (link) {
    const s = findStudent(link[1]);
    const g = s?.guardians.find((x) => x.id === link[2]);
    if (!s || !g)
      return (send(res, 404, problem(404, "students.not_found", "Guardian not found")), true);
    if (method === "PATCH") {
      if (body.relationship !== undefined && body.relationship !== null)
        g.relationship = String(body.relationship);
      if (body.isPrimaryPayer !== undefined && body.isPrimaryPayer !== null)
        g.isPrimaryPayer = Boolean(body.isPrimaryPayer);
      if (body.isEmergencyContact !== undefined && body.isEmergencyContact !== null)
        g.isEmergencyContact = Boolean(body.isEmergencyContact);
      if (body.canPickup !== undefined && body.canPickup !== null)
        g.canPickup = Boolean(body.canPickup);
      send(res, 200, g);
      return true;
    }
    if (method === "DELETE") {
      s.guardians.splice(s.guardians.indexOf(g), 1);
      res.writeHead(204).end();
      return true;
    }
  }
  const guardianById = /^\/api\/v1\/guardians\/([^/]+)$/.exec(path);
  if (guardianById && method === "GET") {
    const g = STUDENTS.flatMap((s) => s.guardians).find((x) => x.id === guardianById[1]);
    if (!g)
      return (send(res, 404, problem(404, "guardians.not_found", "Guardian not found")), true);
    send(res, 200, { ...g, address: null, wards: [] });
    return true;
  }
  if (guardianById && method === "PATCH") {
    const g = STUDENTS.flatMap((s) => s.guardians).find((x) => x.id === guardianById[1]);
    if (!g)
      return (send(res, 404, problem(404, "guardians.not_found", "Guardian not found")), true);
    if (body.phone) g.phone = String(body.phone);
    if (body.email !== undefined) g.email = (body.email as string | null) ?? null;
    send(res, 200, { ...g, address: null, wards: [] });
    return true;
  }
  const invite = /^\/api\/v1\/guardians\/([^/]+)\/portal-invite$/.exec(path);
  if (invite && method === "POST") {
    send(res, 201, { id: randomUUID(), status: "Invited" });
    return true;
  }

  // Documents and notes.
  const docs = /^\/api\/v1\/students\/([^/]+)\/documents$/.exec(path);
  if (docs && method === "GET") {
    send(res, 200, DOCUMENTS.get(docs[1] ?? "") ?? []);
    return true;
  }
  if (docs && method === "POST") {
    const list = DOCUMENTS.get(docs[1] ?? "") ?? [];
    const doc: Doc = {
      id: randomUUID(),
      fileId: String(body.fileId),
      type: String(body.type),
      notes: (body.notes as string | null) ?? null,
      createdAt: new Date().toISOString(),
    };
    list.push(doc);
    DOCUMENTS.set(docs[1] ?? "", list);
    send(res, 201, doc);
    return true;
  }
  const doc = /^\/api\/v1\/students\/([^/]+)\/documents\/([^/]+)$/.exec(path);
  if (doc && method === "DELETE") {
    const list = DOCUMENTS.get(doc[1] ?? "") ?? [];
    DOCUMENTS.set(
      doc[1] ?? "",
      list.filter((d) => d.id !== doc[2]),
    );
    res.writeHead(204).end();
    return true;
  }
  const notes = /^\/api\/v1\/students\/([^/]+)\/notes$/.exec(path);
  if (notes && method === "GET") {
    send(res, 200, NOTES.get(notes[1] ?? "") ?? []);
    return true;
  }
  if (notes && method === "POST") {
    const list = NOTES.get(notes[1] ?? "") ?? [];
    const note: Note = {
      id: randomUUID(),
      category: String(body.category),
      text: String(body.text),
      createdAt: new Date().toISOString(),
    };
    list.push(note);
    NOTES.set(notes[1] ?? "", list);
    send(res, 201, note);
    return true;
  }

  // Files: presign, the content (the bytes), complete, and the download link.
  if (path === "/api/v1/files/presign-upload" && method === "POST") {
    const id = randomUUID();
    FILES.set(id, {
      contentType: String(body.contentType),
      sizeBytes: Number(body.sizeBytes),
      originalName: String(body.fileName),
      status: "Pending",
      bytes: 0,
    });
    send(res, 201, {
      id,
      uploadUrl: `/api/v1/files/${id}/content`,
      method: "PUT",
      contentType: String(body.contentType),
      maxBytes: 10 * 1024 * 1024,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    return true;
  }
  const content = /^\/api\/v1\/files\/([^/]+)\/content$/.exec(path);
  if (content && method === "PUT") {
    const f = FILES.get(content[1] ?? "");
    if (!f) return (send(res, 404, problem(404, "files.not_found", "File not found")), true);
    f.bytes = Number(call.res.getHeader("x-received") ?? 0);
    res.writeHead(204).end();
    return true;
  }
  const complete = /^\/api\/v1\/files\/([^/]+)\/complete$/.exec(path);
  if (complete && method === "POST") {
    const f = FILES.get(complete[1] ?? "");
    if (!f) return (send(res, 404, problem(404, "files.not_found", "File not found")), true);
    f.status = "Stored";
    send(res, 200, {
      id: complete[1],
      purpose: "StudentDocument",
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      status: f.status,
      originalName: f.originalName,
    });
    return true;
  }

  // Bulk import.
  if (path === "/api/v1/students/import/template" && method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="template.csv"',
    });
    res.end(IMPORT_TEMPLATE);
    return true;
  }
  if (path === "/api/v1/students/import" && method === "POST") {
    const id = randomUUID();
    IMPORTS.set(id, {
      status: "Validated",
      rows: [
        { rowNumber: 2, status: "Valid", errors: [] },
        { rowNumber: 3, status: "Valid", errors: [] },
        { rowNumber: 4, status: "Error", errors: ["dateOfBirth: use YYYY-MM-DD"] },
      ],
      createdRows: 0,
    });
    send(res, 202, jobView(id));
    return true;
  }
  const job = /^\/api\/v1\/students\/import\/([^/]+)$/.exec(path);
  if (job && method === "GET") {
    if (!IMPORTS.has(job[1] ?? ""))
      return (send(res, 404, problem(404, "import.not_found", "Import not found")), true);
    send(res, 200, jobView(job[1] ?? ""));
    return true;
  }
  const rows = /^\/api\/v1\/students\/import\/([^/]+)\/rows$/.exec(path);
  if (rows && method === "GET") {
    const j = IMPORTS.get(rows[1] ?? "");
    if (!j) return (send(res, 404, problem(404, "import.not_found", "Import not found")), true);
    const onlyErrors = url.searchParams.get("errorsOnly") === "true";
    const items = j.rows.filter((r) => !onlyErrors || r.status !== "Valid");
    send(res, 200, { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 });
    return true;
  }
  const errors = /^\/api\/v1\/students\/import\/([^/]+)\/errors\.csv$/.exec(path);
  if (errors && method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="errors.csv"',
    });
    res.end("rowNumber,error\n4,dateOfBirth: use YYYY-MM-DD\n");
    return true;
  }
  const commit = /^\/api\/v1\/students\/import\/([^/]+)\/commit$/.exec(path);
  if (commit && method === "POST") {
    const j = IMPORTS.get(commit[1] ?? "");
    if (!j) return (send(res, 404, problem(404, "import.not_found", "Import not found")), true);
    j.status = "Completed";
    j.createdRows = j.rows.filter((r) => r.status === "Valid").length;
    send(res, 202, jobView(commit[1] ?? ""));
    return true;
  }

  // Promotions.
  if (path === "/api/v1/promotions/preview" && method === "POST") {
    send(res, 200, {
      rows: STUDENTS.filter((s) => s.currentClassArmId === body.classArmId).map((s) => ({
        studentId: s.id,
        fullName: [s.firstName, s.lastName].join(" "),
        outcome: "Promote",
        reason: null,
      })),
      promoted: STUDENTS.filter((s) => s.currentClassArmId === body.classArmId).length,
      repeated: 0,
      graduated: 0,
      skipped: 0,
      basis: "Passed every subject",
    });
    return true;
  }
  if (path === "/api/v1/promotions/commit" && method === "POST") {
    send(res, 200, {
      id: randomUUID(),
      fromSessionId: body.fromSessionId,
      toSessionId: body.toSessionId,
      classArmId: body.classArmId,
      promoted: 0,
      repeated: 0,
      graduated: 0,
      skipped: 0,
      replayed: false,
    });
    return true;
  }

  return false;
}

function jobView(id: string) {
  const j = IMPORTS.get(id);
  const rows = j?.rows ?? [];
  return {
    id,
    status: j?.status ?? "Queued",
    mode: null,
    totalRows: rows.length,
    validRows: rows.filter((r) => r.status === "Valid").length,
    errorRows: rows.filter((r) => r.status !== "Valid").length,
    createdRows: j?.createdRows ?? 0,
    message: null,
    requestedAt: new Date().toISOString(),
  };
}
