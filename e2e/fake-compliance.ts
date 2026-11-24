// Test double for compliance (ADR 0025, slice 5): consents, data requests with maker-checker, and the school's data export. A
// request is decided by a different account than the one that asked; the double refuses the same account (422). State is in
// memory and resets with the run.
import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface ComplianceCall {
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

interface Consent {
  id: string;
  subjectType: string;
  subjectId: string;
  purpose: string;
  channel: string;
  grantedAt: string;
  grantedBy: string;
  source: string;
  withdrawnAt: string | null;
  active: boolean;
}

interface DataRequest {
  id: string;
  kind: string;
  subjectType: string;
  subjectId: string;
  reason: string;
  status: string;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  hasExport: boolean;
}

interface TenantExport {
  id: string;
  status: string;
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  tableCount: number | null;
  rowCount: number | null;
  error: string | null;
}

const NOW = "2026-11-22T08:00:00.000Z";
const consents: Consent[] = [];
const requests: DataRequest[] = [];
let exportRecord: TenantExport | null = null;
const CAN = new Set(["admin"]);

export function handleCompliance(call: ComplianceCall): boolean {
  const { method, path, url, body, res, send, label } = call;
  if (!path.startsWith("/api/v1/compliance/")) return false;
  if (!CAN.has(label)) return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);

  if (path === "/api/v1/compliance/consents" && method === "GET") {
    const st = url.searchParams.get("subjectType") ?? "";
    const si = url.searchParams.get("subjectId") ?? "";
    const items = consents.filter((c) => c.subjectType === st && c.subjectId === si);
    send(res, 200, { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 });
    return true;
  }

  if (path === "/api/v1/compliance/consents" && method === "POST") {
    const c: Consent = {
      id: randomUUID(),
      subjectType: String(body.subjectType ?? ""),
      subjectId: String(body.subjectId ?? ""),
      purpose: String(body.purpose ?? ""),
      channel: String(body.channel ?? "Any"),
      grantedAt: NOW,
      grantedBy: label,
      source: String(body.source ?? ""),
      withdrawnAt: null,
      active: true,
    };
    consents.push(c);
    send(res, 200, c);
    return true;
  }

  const withdraw = /^\/api\/v1\/compliance\/consents\/([^/]+)\/withdraw$/.exec(path);
  if (withdraw && method === "POST") {
    const c = consents.find((x) => x.id === withdraw[1]);
    if (!c)
      return (
        send(res, 404, problem(404, "compliance.consent_not_found", "Consent not found")),
        true
      );
    c.withdrawnAt = NOW;
    c.active = false;
    send(res, 200, c);
    return true;
  }

  if (path === "/api/v1/compliance/data-requests" && method === "GET") {
    const status = url.searchParams.get("status") ?? "";
    const items = requests.filter(
      (r) => status === "" || (status === "Open" && r.decidedAt === null),
    );
    send(res, 200, { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 });
    return true;
  }

  if (path === "/api/v1/compliance/data-requests" && method === "POST") {
    const r: DataRequest = {
      id: randomUUID(),
      kind: String(body.kind ?? "Export"),
      subjectType: String(body.subjectType ?? ""),
      subjectId: String(body.subjectId ?? ""),
      reason: String(body.reason ?? ""),
      status: "Pending",
      requestedBy: label,
      requestedAt: NOW,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      hasExport: false,
    };
    requests.push(r);
    send(res, 200, r);
    return true;
  }

  const decide = /^\/api\/v1\/compliance\/data-requests\/([^/]+)\/(approve|reject)$/.exec(path);
  if (decide && method === "POST") {
    const r = requests.find((x) => x.id === decide[1]);
    if (!r)
      return (
        send(res, 404, problem(404, "compliance.request_not_found", "Request not found")),
        true
      );
    if (r.decidedAt !== null)
      return (send(res, 422, problem(422, "compliance.already_decided", "Already decided")), true);
    if (r.requestedBy === label)
      return (
        send(
          res,
          422,
          problem(422, "compliance.maker_checker", "A second person must decide this request"),
        ),
        true
      );
    r.decidedBy = label;
    r.decidedAt = NOW;
    if (decide[2] === "approve") {
      r.status = "Approved";
      r.hasExport = r.kind === "Export";
    } else {
      if (typeof body.note !== "string" || body.note.trim() === "")
        return (send(res, 400, problem(400, "request.malformed", "A note is required")), true);
      r.status = "Refused";
      r.decisionNote = body.note;
    }
    send(res, 200, r);
    return true;
  }

  if (path === "/api/v1/compliance/tenant-export" && method === "POST") {
    exportRecord = {
      id: randomUUID(),
      status: "Queued",
      requestedAt: NOW,
      completedAt: null,
      expiresAt: null,
      sizeBytes: null,
      sha256: null,
      tableCount: null,
      rowCount: null,
      error: null,
    };
    send(res, 200, exportRecord);
    return true;
  }

  const exp = /^\/api\/v1\/compliance\/tenant-export\/([^/]+)$/.exec(path);
  if (exp && method === "GET") {
    if (!exportRecord || exportRecord.id !== exp[1])
      return (
        send(res, 404, problem(404, "compliance.export_not_found", "Export not found")),
        true
      );
    if (exportRecord.status === "Queued") {
      exportRecord = {
        ...exportRecord,
        status: "Completed",
        completedAt: NOW,
        expiresAt: NOW,
        sizeBytes: 2048,
        sha256: "0".repeat(64),
        tableCount: 12,
        rowCount: 340,
      };
    }
    send(res, 200, exportRecord);
    return true;
  }

  const zip = /^\/api\/v1\/compliance\/tenant-export\/([^/]+)\/download$/.exec(path);
  if (zip && method === "GET") {
    if (!exportRecord || exportRecord.id !== zip[1] || exportRecord.status !== "Completed")
      return (
        send(res, 404, problem(404, "compliance.export_not_ready", "Export not ready")),
        true
      );
    res.writeHead(200, { "content-type": "application/zip" });
    res.end(Buffer.from("PK fake export"));
    return true;
  }

  const subjectExport = /^\/api\/v1\/compliance\/data-requests\/([^/]+)\/export$/.exec(path);
  if (subjectExport && method === "GET") {
    const r = requests.find((x) => x.id === subjectExport[1]);
    if (!r || !r.hasExport)
      return (send(res, 404, problem(404, "compliance.export_not_found", "No export")), true);
    send(res, 200, { subjectType: r.subjectType, subjectId: r.subjectId, records: [] });
    return true;
  }

  return false;
}
