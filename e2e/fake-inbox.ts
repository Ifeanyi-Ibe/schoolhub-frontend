// Test double for the staff inbox and notification preferences (ADR 0025, slice 1). The main fake validates the JSON answers
// against the contract, then calls handleInbox. State is in memory and resets with the run.
import type { ServerResponse } from "node:http";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface InboxCall {
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

interface Message {
  id: string;
  subject: string | null;
  body: string;
  category: string;
  deliveredAt: string;
  readAt: string | null;
}

const messages: Message[] = [
  {
    id: "0190a6c2-0000-7000-8000-000000001001",
    subject: "Fee reminder",
    body: "Term fees are due on the 30th.",
    category: "fees",
    deliveredAt: "2026-11-20T08:00:00.000Z",
    readAt: null,
  },
  {
    id: "0190a6c2-0000-7000-8000-000000001002",
    subject: "Staff meeting",
    body: "Staff meet on Monday at 8am.",
    category: "staff",
    deliveredAt: "2026-11-21T08:00:00.000Z",
    readAt: null,
  },
  {
    id: "0190a6c2-0000-7000-8000-000000001003",
    subject: null,
    body: "The school closes early on Friday.",
    category: "calendar",
    deliveredAt: "2026-11-22T08:00:00.000Z",
    readAt: "2026-11-22T09:00:00.000Z",
  },
];

interface Pref {
  category: string;
  channel: string;
  enabled: boolean;
  locked: boolean;
}

const prefs: Pref[] = [
  { category: "fees", channel: "email", enabled: true, locked: false },
  { category: "fees", channel: "sms", enabled: false, locked: false },
  { category: "security", channel: "email", enabled: true, locked: true },
  { category: "security", channel: "sms", enabled: false, locked: true },
];

const CAN = new Set(["admin", "teacher", "approver"]);

export function handleInbox(call: InboxCall): boolean {
  const { method, path, url, body, res, send, label } = call;
  if (
    !path.startsWith("/api/v1/me/notifications") &&
    !path.startsWith("/api/v1/me/notification-preferences")
  )
    return false;
  if (!CAN.has(label)) return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);

  if (path === "/api/v1/me/notifications" && method === "GET") {
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") ?? "20"));
    const all = messages.filter((m) => !unreadOnly || m.readAt === null);
    send(res, 200, {
      unreadCount: messages.filter((m) => m.readAt === null).length,
      items: {
        items: all.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        totalCount: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
      },
    });
    return true;
  }

  if (path === "/api/v1/me/notifications/read-all" && method === "POST") {
    let marked = 0;
    for (const m of messages) {
      if (m.readAt === null) {
        m.readAt = new Date().toISOString();
        marked += 1;
      }
    }
    send(res, 200, { marked });
    return true;
  }

  const one = /^\/api\/v1\/me\/notifications\/([^/]+)\/read$/.exec(path);
  if (one && method === "POST") {
    const m = messages.find((x) => x.id === one[1]);
    if (!m)
      return (send(res, 404, problem(404, "notifications.not_found", "Message not found")), true);
    m.readAt ??= new Date().toISOString();
    send(res, 200, m);
    return true;
  }

  if (path === "/api/v1/me/notification-preferences" && method === "GET") {
    send(res, 200, { items: prefs });
    return true;
  }

  if (path === "/api/v1/me/notification-preferences" && method === "PUT") {
    const changes = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
    for (const c of changes) {
      const p = prefs.find((x) => x.category === c.category && x.channel === c.channel);
      if (!p)
        return (
          send(res, 422, problem(422, "notifications.unknown_preference", "Unknown preference")),
          true
        );
      if (p.locked)
        return (
          send(
            res,
            422,
            problem(422, "notifications.preference_locked", "This preference is required"),
          ),
          true
        );
    }
    for (const c of changes) {
      const p = prefs.find((x) => x.category === c.category && x.channel === c.channel);
      if (p) p.enabled = c.enabled === true;
    }
    send(res, 200, { items: prefs });
    return true;
  }

  return false;
}
