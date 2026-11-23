// Test double for results (ADR 0024): the computation job, the class broadsheet and export, a student's results, domains (traits
// and ratings) and remarks. The main fake (fake-api.ts) validates JSON answers against the contract, then calls handleResults.
// The results are computed here from the score sheets (fake-assessment.ts), so they follow what the screens wrote.
import type { ServerResponse } from "node:http";
import { allSheets, sheetStudents, type StoredSheet } from "./fake-assessment.ts";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface ResultsCall {
  method: string;
  path: string;
  url: URL;
  body: Record<string, unknown>;
  res: ServerResponse;
  send: Send;
  label: string;
}

const problem = (status: number, code: string, title: string) => ({
  type: `urn:schoolhub:error:${code}`,
  title,
  status,
  detail: title,
  code,
});

export const TRAITS = [
  { id: "0190a6c2-0000-7000-8000-000000000d01", kind: "Affective", name: "Punctuality" },
  { id: "0190a6c2-0000-7000-8000-000000000d02", kind: "Psychomotor", name: "Handwriting" },
];

const CAN_SCORE = new Set(["admin", "teacher"]);
const CAN_APPROVE = new Set(["admin", "approver"]);

const ratings = new Map<string, number>(); // `${studentId}|${termId}|${traitId}`
const remarks = new Map<string, string | null>(); // `${kind}|${studentId}|${termId}`
const jobs = new Map<string, Record<string, unknown>>();
let jobSeq = 0;

function termSheets(termId: string, armId: string): StoredSheet[] {
  return allSheets().filter((s) => s.termId === termId && s.classArmId === armId);
}

/** A student's result for a term and class, computed from the sheets of that class. Blank scores are not zero. */
function resultFor(studentId: string, termId: string, armId: string) {
  const student = sheetStudents().find((s) => s.studentId === studentId);
  if (!student) return null;
  const subjects = termSheets(termId, armId).map((sheet) => {
    const cells = [...sheet.cells.entries()].filter(([k]) => k.startsWith(`${studentId}|`));
    const absent = cells.some(([, c]) => c.absent);
    const values = cells.map(([, c]) => c.score).filter((v): v is string => v !== null && v !== "");
    const total = values.length > 0 ? values.reduce((n, v) => n + Number(v), 0).toFixed(1) : null;
    return {
      subjectId: sheet.subjectId,
      subjectName: "Mathematics",
      total,
      grade: total === null ? null : Number(total) >= 50 ? "A" : "F",
      remark: null,
      position: null,
      classAverage: null,
      isAbsent: absent,
      isComplete: total !== null,
    };
  });
  const totals = subjects.map((s) => s.total).filter((t): t is string => t !== null);
  const termTotal = totals.length > 0 ? totals.reduce((n, v) => n + Number(v), 0).toFixed(1) : null;
  const termAverage = totals.length > 0 ? (Number(termTotal) / totals.length).toFixed(1) : null;
  return {
    studentId,
    admissionNo: student.admissionNo,
    studentName: student.studentName,
    subjects,
    termTotal,
    termAverage,
    position: null,
    outOf: sheetStudents().length,
    cumulativeAverage: null,
    promotion: null,
    isComplete: subjects.every((s) => s.isComplete),
  };
}

function ratingsView(studentId: string, termId: string) {
  return TRAITS.flatMap((t) => {
    const r = ratings.get(`${studentId}|${termId}|${t.id}`);
    return r === undefined ? [] : [{ traitId: t.id, kind: t.kind, name: t.name, rating: r }];
  });
}

/** Report cards (ADR 0024, slice 4). One card per student per class and term; the second student's fees are not cleared. */
interface CardRecord {
  id: string;
  studentId: string;
  termId: string;
  classArmId: string;
  version: number;
  layout: string;
  status: "Generated" | "Withheld" | "Published";
  feesWithheld: boolean;
  generatedAt: string;
  publishedAt: string | null;
}
const cards: CardRecord[] = [];
let cardSeq = 0;
const WITHHELD_STUDENT = "0190a6c2-0000-7000-8000-000000000f02";
const CAN_PUBLISH = new Set(["admin"]);

function cardsFor(termId: string, armId: string): CardRecord[] {
  return cards.filter((c) => c.termId === termId && c.classArmId === armId);
}

function cardView(c: CardRecord) {
  return {
    id: c.id,
    studentId: c.studentId,
    termId: c.termId,
    classArmId: c.classArmId,
    version: c.version,
    layout: c.layout,
    status: c.status,
    feesWithheld: c.feesWithheld,
    generatedAt: c.generatedAt,
    publishedAt: c.publishedAt,
  };
}

/** Amendments (ADR 0024, slice 5): a request records the current and the new score; an approval writes the new score. */
interface AmendmentRecord {
  id: string;
  studentId: string;
  subjectId: string;
  componentId: string;
  before: string | null;
  after: string | null;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  sheetId: string | null;
}
const amendments = new Map<string, AmendmentRecord>();
let amendSeq = 0;
const AMEND_REQUEST = new Set(["admin"]);
const AMEND_APPROVE = new Set(["admin", "approver"]);

export function handleResults(call: ResultsCall): boolean {
  const { method, path, url, body, res, send, label } = call;
  const canScore = CAN_SCORE.has(label);
  const canApprove = CAN_APPROVE.has(label);

  if (path === "/api/v1/assessment/compute" && method === "POST") {
    if (!canApprove) return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const id = `0190a6c2-0000-7000-8000-${String(0xe00 + ++jobSeq).padStart(12, "0")}`;
    const job = { id, kind: "Compute", status: "Completed", total: 1, done: 1, error: null };
    jobs.set(id, job);
    send(res, 200, job);
    return true;
  }

  const job = /^\/api\/v1\/assessment\/jobs\/([^/]+)$/.exec(path);
  if (job && method === "GET") {
    if (!canScore && !canApprove)
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const found = jobs.get(job[1] ?? "");
    if (!found)
      return (send(res, 404, problem(404, "assessment.job_not_found", "Job not found")), true);
    send(res, 200, found);
    return true;
  }

  if (path === "/api/v1/assessment/results/class" && method === "GET") {
    if (!canScore && !canApprove)
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const termId = url.searchParams.get("termId") ?? "";
    const armId = url.searchParams.get("classArmId") ?? "";
    const rows = sheetStudents()
      .map((s) => resultFor(s.studentId, termId, armId))
      .filter((r) => r !== null);
    send(res, 200, termSheets(termId, armId).length > 0 ? rows : []);
    return true;
  }

  if (path === "/api/v1/assessment/results/class/export" && method === "GET") {
    if (!canScore && !canApprove)
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    // A workbook is answered as bytes, not JSON, so it is not checked against the contract's JSON schemas.
    res.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    res.end(Buffer.from("PK\u0003\u0004 fake broadsheet"));
    return true;
  }

  const student = /^\/api\/v1\/assessment\/results\/students\/([^/]+)$/.exec(path);
  if (student && method === "GET") {
    if (!canScore && !canApprove)
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const result = resultFor(student[1] ?? "", url.searchParams.get("termId") ?? "", "");
    if (!result)
      return (send(res, 404, problem(404, "students.not_found", "Student not found")), true);
    send(res, 200, result);
    return true;
  }

  if (path === "/api/v1/domain-traits" && method === "GET") {
    send(res, 200, TRAITS);
    return true;
  }

  const rated = /^\/api\/v1\/assessment\/ratings\/students\/([^/]+)$/.exec(path);
  if (rated && method === "PUT") {
    if (!canScore) return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const termId = url.searchParams.get("termId") ?? "";
    const entries = Array.isArray(body.ratings)
      ? (body.ratings as Array<Record<string, unknown>>)
      : [];
    for (const e of entries) {
      const n = Number(e.rating);
      if (!Number.isInteger(n) || n < 1 || n > 5 || !TRAITS.some((t) => t.id === e.traitId))
        return (send(res, 400, problem(400, "ratings.invalid", "A rating is out of range")), true);
    }
    for (const e of entries)
      ratings.set(`${rated[1]}|${termId}|${String(e.traitId)}`, Number(e.rating));
    send(res, 200, ratingsView(rated[1] ?? "", termId));
    return true;
  }

  const remark = /^\/api\/v1\/assessment\/remarks\/students\/([^/]+)\/(teacher|principal)$/.exec(
    path,
  );
  if (remark && method === "PUT") {
    const kind = remark[2];
    if (kind === "principal" && !canApprove)
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    if (kind === "teacher" && !canScore)
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const termId = url.searchParams.get("termId") ?? "";
    const text = typeof body.remark === "string" ? body.remark : null;
    remarks.set(`${kind}|${remark[1]}|${termId}`, text);
    res.writeHead(204);
    res.end();
    return true;
  }

  if (path === "/api/v1/report-cards/generate" && method === "POST") {
    if (!canApprove) return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const termId = String(body.termId ?? "");
    const armId = String(body.classArmId ?? "");
    const layout = body.layout === "Secondary" ? "Secondary" : "Primary";
    const ids: string[] = [];
    let skipped = 0;
    for (const st of sheetStudents()) {
      if (
        cards.some(
          (c) => c.studentId === st.studentId && c.termId === termId && c.classArmId === armId,
        )
      ) {
        skipped += 1;
        continue;
      }
      const id = `0190a6c2-0000-7000-8000-${String(0xf00 + ++cardSeq).padStart(12, "0")}`;
      cards.push({
        id,
        studentId: st.studentId,
        termId,
        classArmId: armId,
        version: 1,
        layout,
        status: st.studentId === WITHHELD_STUDENT ? "Withheld" : "Generated",
        feesWithheld: st.studentId === WITHHELD_STUDENT,
        generatedAt: new Date().toISOString(),
        publishedAt: null,
      });
      ids.push(id);
    }
    const jobIdValue = `0190a6c2-0000-7000-8000-${String(0xe00 + ++jobSeq).padStart(12, "0")}`;
    jobs.set(jobIdValue, {
      id: jobIdValue,
      kind: "ReportCards",
      status: "Completed",
      total: ids.length,
      done: ids.length,
      error: null,
    });
    send(res, 200, { generated: ids.length, skipped, cardIds: ids, jobId: jobIdValue });
    return true;
  }

  if (path === "/api/v1/report-cards" && method === "GET") {
    if (!canScore && !canApprove)
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const studentId = url.searchParams.get("studentId");
    const list = cardsFor(
      url.searchParams.get("termId") ?? "",
      url.searchParams.get("classArmId") ?? "",
    )
      .filter((c) => !studentId || c.studentId === studentId)
      .map(cardView);
    send(res, 200, list);
    return true;
  }

  const download = /^\/api\/v1\/report-cards\/([^/]+)\/download$/.exec(path);
  if (download && method === "GET") {
    if (!canScore && !canApprove)
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const card = cards.find((c) => c.id === download[1]);
    if (!card)
      return (
        send(res, 404, problem(404, "assessment.card_not_found", "Report card not found")),
        true
      );
    if (card.feesWithheld)
      return (
        send(
          res,
          422,
          problem(
            422,
            "assessment.card_withheld",
            "The card is withheld until the school fees are cleared",
          ),
        ),
        true
      );
    res.writeHead(200, { "content-type": "application/pdf" });
    res.end(Buffer.from("%PDF-1.4 fake report card"));
    return true;
  }

  if (path === "/api/v1/report-cards/publish" && method === "POST") {
    if (!CAN_PUBLISH.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const termId = String(body.termId ?? "");
    const armId = String(body.classArmId ?? "");
    let published = 0;
    let withheld = 0;
    for (const c of cardsFor(termId, armId)) {
      if (c.feesWithheld) {
        withheld += 1;
        continue;
      }
      if (c.publishedAt === null) {
        c.publishedAt = new Date().toISOString();
        c.status = "Published";
        published += 1;
      }
    }
    send(res, 200, { published, withheld });
    return true;
  }

  if (path === "/api/v1/assessment/amendments" && method === "POST") {
    if (!AMEND_REQUEST.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const sheet = allSheets().find(
      (x) =>
        x.termId === String(body.termId ?? "") &&
        x.classArmId === String(body.classArmId ?? "") &&
        x.subjectId === String(body.subjectId ?? ""),
    );
    if (!sheet || sheet.status !== "Approved")
      return (
        send(res, 422, problem(422, "assessment.not_published", "The result is not published")),
        true
      );
    const key = `${String(body.studentId ?? "")}|${String(body.componentId ?? "")}`;
    const id = `0190a6c2-0000-7000-8000-${String(0xa00 + ++amendSeq).padStart(12, "0")}`;
    const record: AmendmentRecord = {
      id,
      studentId: String(body.studentId ?? ""),
      subjectId: String(body.subjectId ?? ""),
      componentId: String(body.componentId ?? ""),
      before: sheet.cells.get(key)?.score ?? null,
      after: String(body.score ?? ""),
      reason: String(body.reason ?? ""),
      status: "Pending",
      sheetId: sheet.id,
    };
    amendments.set(id, record);
    send(res, 201, record);
    return true;
  }

  const decide = /^\/api\/v1\/assessment\/amendments\/([^/]+)\/(approve|reject)$/.exec(path);
  if (decide && method === "POST") {
    if (!AMEND_APPROVE.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const record = amendments.get(decide[1] ?? "");
    if (!record)
      return (
        send(res, 404, problem(404, "assessment.amendment_not_found", "Amendment not found")),
        true
      );
    if (record.status !== "Pending")
      return (
        send(
          res,
          422,
          problem(422, "assessment.amendment_decided", "The amendment was already decided"),
        ),
        true
      );
    if (decide[2] === "reject" && (typeof body.reason !== "string" || body.reason.trim() === ""))
      return (
        send(res, 400, problem(400, "request.malformed", "A reason is required to reject")),
        true
      );
    if (decide[2] === "approve") {
      record.status = "Approved";
      const sheet = allSheets().find((x) => x.id === record.sheetId);
      sheet?.cells.set(`${record.studentId}|${record.componentId}`, {
        score: record.after,
        absent: false,
        updatedAt: new Date().toISOString(),
      });
    } else {
      record.status = "Rejected";
    }
    send(res, 200, record);
    return true;
  }

  return false;
}
