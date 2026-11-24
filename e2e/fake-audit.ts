// Test double for the audit log and its export (ADR 0025, slice 8). The log is seeded; an export is queued, and it completes on the
// next status read, as the server builds exports in the background. State resets with the run.
import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface AuditCall {
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

interface Entry {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorType: string;
  actorIp: string | null;
  userAgent: string | null;
  correlationId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  outcome: string;
  changes: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

const entries: Entry[] = [
  {
    id: "0190a6c2-0000-7000-8000-000000004001",
    occurredAt: "2026-11-22T08:00:00.000Z",
    actorUserId: null,
    actorType: "User",
    actorIp: null,
    userAgent: null,
    correlationId: null,
    action: "student.update",
    entityType: "Student",
    entityId: "0190a6c2-0000-7000-8000-000000000f01",
    summary: "Changed a student's guardian",
    outcome: "Success",
    changes: {},
    metadata: {},
  },
  {
    id: "0190a6c2-0000-7000-8000-000000004002",
    occurredAt: "2026-11-22T09:00:00.000Z",
    actorUserId: null,
    actorType: "User",
    actorIp: null,
    userAgent: null,
    correlationId: null,
    action: "payment.reverse",
    entityType: "Payment",
    entityId: null,
    summary: "Refused a reversal without approval",
    outcome: "Denied",
    changes: {},
    metadata: {},
  },
  {
    id: "0190a6c2-0000-7000-8000-000000004003",
    occurredAt: "2026-11-22T10:00:00.000Z",
    actorUserId: null,
    actorType: "System",
    actorIp: null,
    userAgent: null,
    correlationId: null,
    action: "report.generate",
    entityType: "ReportCard",
    entityId: null,
    summary: "Generated report cards",
    outcome: "Success",
    changes: {},
    metadata: {},
  },
];

interface Export {
  id: string;
  status: string;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  rowCount: number | null;
  errorCode: string | null;
}

/** Every export, by id: two journeys may run at once, and each keeps its own export, as the server does. */
const exports = new Map<string, Export>();
const CAN = new Set(["admin"]);
const NOW = "2026-11-22T11:00:00.000Z";

function view(e: Entry) {
  return { ...e };
}

export function handleAudit(call: AuditCall): boolean {
  const { method, path, url, res, send, label } = call;
  if (!path.startsWith("/api/v1/audit-logs")) return false;
  if (!CAN.has(label)) return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);

  if (path === "/api/v1/audit-logs" && method === "GET") {
    const action = url.searchParams.get("action") ?? "";
    const outcome = url.searchParams.get("outcome") ?? "";
    const entityType = url.searchParams.get("entityType") ?? "";
    const items = entries.filter(
      (e) =>
        (action === "" || e.action.includes(action)) &&
        (outcome === "" || e.outcome === outcome) &&
        (entityType === "" || e.entityType === entityType),
    );
    send(res, 200, { items: items.map(view), nextCursor: null });
    return true;
  }

  if (path === "/api/v1/audit-logs/export" && method === "POST") {
    const started: Export = {
      id: randomUUID(),
      status: "Queued",
      requestedAt: NOW,
      startedAt: null,
      completedAt: null,
      rowCount: null,
      errorCode: null,
    };
    exports.set(started.id, started);
    send(res, 202, {
      id: started.id,
      status: started.status,
      requestedAt: NOW,
      startedAt: null,
      completedAt: null,
      rowCount: null,
      errorCode: null,
    });
    return true;
  }

  const status = /^\/api\/v1\/audit-logs\/exports\/([^/]+)$/.exec(path);
  if (status && method === "GET") {
    const record = exports.get(status[1] ?? "");
    if (!record)
      return (send(res, 404, problem(404, "audit.export_not_found", "Export not found")), true);
    if (record.status !== "Completed") {
      exports.set(record.id, {
        ...record,
        status: "Completed",
        startedAt: NOW,
        completedAt: NOW,
        rowCount: entries.length,
      });
    }
    send(res, 200, exports.get(record.id) ?? record);
    return true;
  }

  const download = /^\/api\/v1\/audit-logs\/exports\/([^/]+)\/download$/.exec(path);
  if (download && method === "GET") {
    const done = exports.get(download[1] ?? "");
    if (!done || done.status !== "Completed")
      return (send(res, 409, problem(409, "audit.export_not_ready", "Export not ready")), true);
    res.writeHead(200, { "content-type": "text/csv" });
    res.end("occurredAt,action,summary,outcome\n");
    return true;
  }

  return false;
}
