// Test double for notification templates, the message log, statistics and the SMS wallet (ADR 0025, slice 3). State is in memory
// and resets with the run.
import type { ServerResponse } from "node:http";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface NotificationsCall {
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

interface Template {
  key: string;
  category: string;
  defaultSubject: string | null;
  defaultBody: string;
  subject: string | null;
  body: string;
  variables: string[];
  isCustomised: boolean;
}

const templates: Template[] = [
  {
    key: "fee_reminder",
    category: "fees",
    defaultSubject: "Fees due",
    defaultBody: "Dear parent, {studentName}'s fees of {amount} are due.",
    subject: "Fees due",
    body: "Dear parent, {studentName}'s fees of {amount} are due.",
    variables: ["studentName", "amount"],
    isCustomised: false,
  },
  {
    key: "absence_alert",
    category: "attendance",
    defaultSubject: null,
    defaultBody: "{studentName} was absent on {date}.",
    subject: null,
    body: "{studentName} was absent on {date}.",
    variables: ["studentName", "date"],
    isCustomised: false,
  },
  {
    key: "announcement",
    category: "announcements",
    defaultSubject: null,
    defaultBody: "{title}",
    subject: null,
    body: "{title}",
    variables: ["title"],
    isCustomised: false,
  },
];

interface Message {
  id: string;
  channel: string;
  category: string;
  templateKey: string;
  subject: string | null;
  body: string;
  maskedAddress: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  deliveredAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

const NOW = "2026-11-22T08:00:00.000Z";
const messages: Message[] = [
  {
    id: "0190a6c2-0000-7000-8000-000000002001",
    channel: "sms",
    category: "fees",
    templateKey: "fee_reminder",
    subject: "Fees due",
    body: "Dear parent, Ada Okafor's fees of ₦15,000 are due.",
    maskedAddress: "+234 ••• ••• 0123",
    status: "Sent",
    attempts: 1,
    lastError: null,
    deliveredAt: NOW,
    sentAt: NOW,
    createdAt: NOW,
  },
  {
    id: "0190a6c2-0000-7000-8000-000000002002",
    channel: "sms",
    category: "attendance",
    templateKey: "absence_alert",
    subject: null,
    body: "Bola Musa was absent on 2026-11-21.",
    maskedAddress: "+234 ••• ••• 0456",
    status: "Failed",
    attempts: 2,
    lastError: "Carrier timeout",
    deliveredAt: null,
    sentAt: null,
    createdAt: NOW,
  },
  {
    id: "0190a6c2-0000-7000-8000-000000002003",
    channel: "inapp",
    category: "announcements",
    templateKey: "announcement",
    subject: null,
    body: "Sports day",
    maskedAddress: null,
    status: "Sent",
    attempts: 1,
    lastError: null,
    deliveredAt: NOW,
    sentAt: NOW,
    createdAt: NOW,
  },
];

/** The template as the contract describes it: without the defaults the double keeps for resets. */
function publicTemplate(tpl: Template) {
  return {
    key: tpl.key,
    category: tpl.category,
    subject: tpl.subject,
    body: tpl.body,
    variables: tpl.variables,
    isCustomised: tpl.isCustomised,
  };
}

const CAN_TEMPLATES = new Set(["admin"]);
const CAN_MESSAGES = new Set(["admin"]);
const CAN_RETRY = new Set(["admin"]);

export function handleNotifications(call: NotificationsCall): boolean {
  const { method, path, url, body, res, send, label } = call;
  if (!path.startsWith("/api/v1/notifications/")) return false;

  if (path === "/api/v1/notifications/templates" && method === "GET") {
    if (!CAN_TEMPLATES.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    send(res, 200, templates.map(publicTemplate));
    return true;
  }

  const one = /^\/api\/v1\/notifications\/templates\/([^/]+)$/.exec(path);
  if (one && (method === "PUT" || method === "DELETE")) {
    if (!CAN_TEMPLATES.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const tpl = templates.find((x) => x.key === one[1]);
    if (!tpl)
      return (
        send(res, 404, problem(404, "notifications.template_not_found", "Template not found")),
        true
      );
    if (method === "PUT") {
      tpl.subject = typeof body.subject === "string" && body.subject !== "" ? body.subject : null;
      tpl.body = String(body.body ?? "");
      tpl.isCustomised = tpl.body !== tpl.defaultBody || tpl.subject !== tpl.defaultSubject;
    } else {
      tpl.subject = tpl.defaultSubject;
      tpl.body = tpl.defaultBody;
      tpl.isCustomised = false;
    }
    send(res, 200, publicTemplate(tpl));
    return true;
  }

  const preview = /^\/api\/v1\/notifications\/templates\/([^/]+)\/preview$/.exec(path);
  if (preview && method === "POST") {
    if (!CAN_TEMPLATES.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const tpl = templates.find((x) => x.key === preview[1]);
    if (!tpl)
      return (
        send(res, 404, problem(404, "notifications.template_not_found", "Template not found")),
        true
      );
    const sample: Record<string, string> = {
      studentName: "Ada Okafor",
      amount: "₦15,000",
      date: "2026-11-21",
      title: "Sports day",
    };
    const fill = (text: string) =>
      text.replace(/\{(\w+)\}/g, (_m, k: string) => sample[k] ?? `{${k}}`);
    const subject =
      typeof body.subject === "string" && body.subject !== "" ? fill(body.subject) : null;
    send(res, 200, { subject, body: fill(String(body.body ?? "")) });
    return true;
  }

  if (path === "/api/v1/notifications/messages" && method === "GET") {
    if (!CAN_MESSAGES.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const status = url.searchParams.get("status") ?? "";
    const channel = url.searchParams.get("channel") ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") ?? "20"));
    const all = messages.filter(
      (m) => (status === "" || m.status === status) && (channel === "" || m.channel === channel),
    );
    const full = (m: Message) => ({
      ...m,
      scheduledFor: m.createdAt,
      provider: m.channel === "sms" ? "test-sms" : null,
      suppressionReason: null,
      costUnits: m.channel === "sms" ? 1 : 0,
      announcementId: null,
    });
    send(res, 200, {
      items: all.slice((page - 1) * pageSize, page * pageSize).map(full),
      page,
      pageSize,
      totalCount: all.length,
    });
    return true;
  }

  const retry = /^\/api\/v1\/notifications\/messages\/([^/]+)\/retry$/.exec(path);
  if (retry && method === "POST") {
    if (!CAN_RETRY.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const m = messages.find((x) => x.id === retry[1]);
    if (!m)
      return (
        send(res, 404, problem(404, "notifications.message_not_found", "Message not found")),
        true
      );
    if (m.deliveredAt !== null)
      return (
        send(res, 422, problem(422, "notifications.already_delivered", "Already delivered")),
        true
      );
    m.status = "Queued";
    m.attempts += 1;
    m.lastError = null;
    send(res, 200, {
      ...m,
      scheduledFor: m.createdAt,
      provider: null,
      suppressionReason: null,
      costUnits: 1,
      announcementId: null,
    });
    return true;
  }

  if (path === "/api/v1/notifications/stats" && method === "GET") {
    if (!CAN_MESSAGES.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    const days = Math.max(1, Number(url.searchParams.get("days") ?? "30"));
    const byStatus: Record<string, number> = {};
    const byChannel: Record<string, number> = {};
    for (const m of messages) {
      byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
      byChannel[m.channel] = (byChannel[m.channel] ?? 0) + 1;
    }
    const delivered = messages.filter((m) => m.deliveredAt !== null).length;
    send(res, 200, {
      days,
      total: messages.length,
      byStatus,
      byChannel,
      successRatePercent:
        messages.length === 0 ? null : Math.round((delivered / messages.length) * 1000) / 10,
    });
    return true;
  }

  if (path === "/api/v1/notifications/sms-wallet" && method === "GET") {
    if (!CAN_MESSAGES.has(label))
      return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);
    send(res, 200, {
      balance: 100,
      reserved: 0,
      available: 100,
      recent: [
        {
          kind: "Credit",
          units: 100,
          balanceAfter: 100,
          reservedAfter: 0,
          reason: "Starter units",
          occurredAt: NOW,
        },
      ],
    });
    return true;
  }

  return false;
}
