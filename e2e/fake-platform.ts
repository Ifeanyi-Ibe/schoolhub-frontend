// Test double for the platform area (ADR 0027): the sign-in steps (password, then MFA), the schools, their status changes, and the
// metrics. Platform calls must carry the platform token (label "platform"); a school token is refused. State is in memory.
import type { ServerResponse } from "node:http";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface PlatformCall {
  method: string;
  path: string;
  url: URL;
  body: Record<string, unknown>;
  res: ServerResponse;
  send: Send;
  label: string;
  fakeToken: (label: string) => string;
}

const problem = (status: number, code: string, title: string) => ({
  type: `urn:schoolhub:error:${code}`,
  title,
  status,
  detail: title,
  code,
});

export const PLATFORM_LOGIN = { identifier: "platform@test.invalid", password: "platform-pass" };
export const PLATFORM_MFA_CODE = "123456";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  planCode: string;
  trialEndsAt: string | null;
  statusReason: string | null;
  createdAt: string;
}

const tenants: Tenant[] = [
  {
    id: "0190a6c2-0000-7000-8000-000000005001",
    slug: "greenfield",
    name: "Greenfield Academy",
    status: "Active",
    planCode: "standard",
    trialEndsAt: null,
    statusReason: null,
    createdAt: "2026-09-01T08:00:00.000Z",
  },
  {
    id: "0190a6c2-0000-7000-8000-000000005002",
    slug: "riverside",
    name: "Riverside College",
    status: "Trial",
    planCode: "trial",
    trialEndsAt: "2026-12-01T08:00:00.000Z",
    statusReason: null,
    createdAt: "2026-11-01T08:00:00.000Z",
  },
];

export function handlePlatform(call: PlatformCall): boolean {
  const { method, path, url, body, res, send, label, fakeToken } = call;

  if (path === "/api/v1/platform/auth/login" && method === "POST") {
    if (body.identifier !== PLATFORM_LOGIN.identifier || body.password !== PLATFORM_LOGIN.password)
      return (send(res, 401, problem(401, "auth.invalid", "Sign-in failed")), true);
    send(res, 200, {
      accessToken: "",
      refreshToken: "",
      expiresIn: 0,
      tokenType: "Bearer",
      mfaRequired: true,
      mfaToken: "platform-mfa-challenge",
      mfaEnrollmentRequired: false,
      enrollmentToken: null,
    });
    return true;
  }

  if (path === "/api/v1/platform/auth/mfa/verify" && method === "POST") {
    if (body.mfaToken !== "platform-mfa-challenge" || body.code !== PLATFORM_MFA_CODE)
      return (send(res, 401, problem(401, "auth.mfa_invalid", "The code is not right")), true);
    send(res, 200, {
      accessToken: fakeToken("platform"),
      refreshToken: "rt:platform:1",
      expiresIn: 900,
      tokenType: "Bearer",
      mfaRequired: false,
      mfaToken: null,
      mfaEnrollmentRequired: false,
      enrollmentToken: null,
    });
    return true;
  }

  // Everything below is the platform's own API: only the platform token passes.
  if (!path.startsWith("/api/v1/platform/")) return false;
  if (label !== "platform") return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);

  if (path === "/api/v1/platform/tenants" && method === "GET") {
    const status = url.searchParams.get("status") ?? "";
    const items = tenants.filter((t) => status === "" || t.status === status);
    send(res, 200, { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 });
    return true;
  }

  const one = /^\/api\/v1\/platform\/tenants\/([^/]+)$/.exec(path);
  if (one && method === "GET") {
    const t = tenants.find((x) => x.id === one[1]);
    if (!t)
      return (send(res, 404, problem(404, "platform.tenant_not_found", "School not found")), true);
    send(res, 200, t);
    return true;
  }

  const suspend = /^\/api\/v1\/platform\/tenants\/([^/]+)\/suspend$/.exec(path);
  if (suspend && method === "POST") {
    const t = tenants.find((x) => x.id === suspend[1]);
    if (!t)
      return (send(res, 404, problem(404, "platform.tenant_not_found", "School not found")), true);
    if (typeof body.reason !== "string" || body.reason.trim() === "")
      return (
        send(res, 422, problem(422, "platform.reason_required", "A reason is required")),
        true
      );
    t.status = "Suspended";
    t.statusReason = body.reason;
    send(res, 200, t);
    return true;
  }

  const reactivate = /^\/api\/v1\/platform\/tenants\/([^/]+)\/reactivate$/.exec(path);
  if (reactivate && method === "POST") {
    const t = tenants.find((x) => x.id === reactivate[1]);
    if (!t)
      return (send(res, 404, problem(404, "platform.tenant_not_found", "School not found")), true);
    t.status = "Active";
    t.statusReason = null;
    send(res, 200, t);
    return true;
  }

  if (path === "/api/v1/platform/metrics" && method === "GET") {
    send(res, 200, {
      tenantsByStatus: { Trial: 1, Active: 1, PastDue: 0, Suspended: 0, Cancelled: 0 },
      monthlyRecurringRevenueKobo: 5000000,
      churnedLast30Days: 0,
      openInvoices: 2,
      openInvoicesKobo: 5000000,
      overdueInvoices: 0,
    });
    return true;
  }

  return false;
}
