// Test double for announcements (ADR 0025, slice 2): create, edit, audience preview, send and cancel. The audience counts are
// fixed here; the SMS wallet holds a fixed balance. State is in memory and resets with the run.
import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface AnnouncementsCall {
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

interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  audienceIds: string[];
  channels: string[];
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  recipientCount: number;
  estimatedSmsUnits: number;
  createdAt: string;
}

const announcements: Announcement[] = [];
const SMS_BALANCE = 100;
const CAN = new Set(["admin"]);

/** The recipients for an audience: fixed counts for the test school. */
function recipientsFor(audience: string, ids: string[]): number {
  if (audience === "all") return 42;
  if (audience === "staff") return 9;
  return Math.max(1, ids.length) * 4;
}

export function handleAnnouncements(call: AnnouncementsCall): boolean {
  const { method, path, url, body, res, send, label } = call;
  if (!path.startsWith("/api/v1/announcements")) return false;
  if (!CAN.has(label)) return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);

  if (path === "/api/v1/announcements" && method === "GET") {
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") ?? "20"));
    const all = [...announcements].reverse();
    send(res, 200, {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      totalCount: all.length,
      totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
    });
    return true;
  }

  if (path === "/api/v1/announcements" && method === "POST") {
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const audience = String(body.audience ?? "all");
    const a: Announcement = {
      id: randomUUID(),
      title: String(body.title ?? ""),
      body: String(body.body ?? ""),
      audience,
      audienceIds: ids,
      channels: Array.isArray(body.channels) ? (body.channels as string[]) : [],
      status: "Draft",
      scheduledFor: null,
      sentAt: null,
      cancelledAt: null,
      recipientCount: recipientsFor(audience, ids),
      estimatedSmsUnits: 0,
      createdAt: new Date().toISOString(),
    };
    a.estimatedSmsUnits = a.channels.includes("sms") ? a.recipientCount : 0;
    announcements.push(a);
    send(res, 201, a);
    return true;
  }

  if (path === "/api/v1/announcements/audience-preview" && method === "POST") {
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const audience = String(body.audience ?? "all");
    const channels = Array.isArray(body.channels) ? (body.channels as string[]) : [];
    const recipients = recipientsFor(audience, ids);
    const estimate = channels.includes("sms") ? recipients : 0;
    send(res, 200, {
      recipients,
      withPhone: recipients - 2,
      withEmail: recipients - 5,
      withAccount: recipients - 10,
      estimatedSmsUnits: estimate,
      availableSmsUnits: SMS_BALANCE,
      sufficient: estimate <= SMS_BALANCE,
    });
    return true;
  }

  const one = /^\/api\/v1\/announcements\/([^/]+)$/.exec(path);
  if (one && method === "PUT") {
    const a = announcements.find((x) => x.id === one[1]);
    if (!a)
      return (
        send(res, 404, problem(404, "announcements.not_found", "Announcement not found")),
        true
      );
    if (a.sentAt !== null || a.cancelledAt !== null)
      return (
        send(
          res,
          409,
          problem(409, "announcements.closed", "The announcement can no longer change"),
        ),
        true
      );
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    Object.assign(a, {
      title: String(body.title ?? a.title),
      body: String(body.body ?? a.body),
      audience: String(body.audience ?? a.audience),
      audienceIds: ids,
      channels: Array.isArray(body.channels) ? (body.channels as string[]) : a.channels,
      recipientCount: recipientsFor(String(body.audience ?? a.audience), ids),
    });
    a.estimatedSmsUnits = a.channels.includes("sms") ? a.recipientCount : 0;
    send(res, 200, a);
    return true;
  }

  const send_ = /^\/api\/v1\/announcements\/([^/]+)\/send$/.exec(path);
  if (send_ && method === "POST") {
    const a = announcements.find((x) => x.id === send_[1]);
    if (!a)
      return (
        send(res, 404, problem(404, "announcements.not_found", "Announcement not found")),
        true
      );
    if (a.sentAt !== null || a.cancelledAt !== null)
      return (
        send(
          res,
          409,
          problem(409, "announcements.closed", "The announcement can no longer be sent"),
        ),
        true
      );
    if (a.channels.includes("sms") && a.estimatedSmsUnits > SMS_BALANCE)
      return (send(res, 422, problem(422, "sms.insufficient_units", "Not enough SMS units")), true);
    a.sentAt = new Date().toISOString();
    a.status = "Sent";
    const inApp = a.channels.includes("inapp") ? a.recipientCount : 0;
    send(res, 200, {
      announcement: a,
      queued: a.recipientCount,
      inApp,
      suppressed: 0,
      duplicates: 0,
      suppressedBy: {},
    });
    return true;
  }

  const cancel = /^\/api\/v1\/announcements\/([^/]+)\/cancel$/.exec(path);
  if (cancel && method === "POST") {
    const a = announcements.find((x) => x.id === cancel[1]);
    if (!a)
      return (
        send(res, 404, problem(404, "announcements.not_found", "Announcement not found")),
        true
      );
    if (a.sentAt !== null || a.cancelledAt !== null)
      return (
        send(
          res,
          409,
          problem(409, "announcements.closed", "The announcement can no longer be cancelled"),
        ),
        true
      );
    a.cancelledAt = new Date().toISOString();
    a.status = "Cancelled";
    send(res, 200, a);
    return true;
  }

  return false;
}
