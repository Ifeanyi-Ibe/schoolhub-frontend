// TEST DOUBLE for the .NET API, used only by the e2e and Lighthouse runs. It is NOT the backend.
// Identifiers end in .invalid and passwords are fixed test values; none is a real account.
// It records the headers it receives so tests can assert what the BFF forwards.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contractProblems, violations } from "./contract.ts";

export const FAKE_API_PORT = Number(process.env.FAKE_API_PORT ?? 5999);
export const FAKE_API_URL = `http://127.0.0.1:${FAKE_API_PORT}`;
export const TEST_PASSWORD = "test-password-1234";
export const TEST_BFF_KEY = "e2e-test-bff-key-0123456789abcdefghij";
export const TENANT = "greenfield";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** Unsigned JWT: enough for the BFF's timing logic and for this double's own checks. */
export function fakeJwt(label: string, expiresInSeconds = 900, tid = TENANT): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${b64({ alg: "none" })}.${b64({ sub: label, tid, exp })}.sig`;
}

function labelOf(bearer: string | undefined): string | null {
  if (!bearer?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(bearer.slice(7).split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

const received = new Map<string, Record<string, string | undefined>>();
const raced = new Set<string>();
const PNG = readFileSync(resolve(process.cwd(), "public/icons/icon-192.png"));

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}
const problem = (code: string, title: string) => ({
  type: `urn:schoolhub:error:${code}`,
  title,
  status: 0,
  code,
  traceId: "00-e2e-trace",
});

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function headerSnapshot(req: IncomingMessage): Record<string, string | undefined> {
  const h = req.headers;
  return {
    authorization: h.authorization,
    "x-bff-key": h["x-bff-key"] as string | undefined,
    "x-tenant": h["x-tenant"] as string | undefined,
    "x-forwarded-for": h["x-forwarded-for"] as string | undefined,
    "x-client-user-agent": h["x-client-user-agent"] as string | undefined,
    cookie: h.cookie,
    "idempotency-key": h["idempotency-key"] as string | undefined,
  };
}

const branding = {
  name: "Greenfield Academy",
  logoUrl: `${FAKE_API_URL}/api/v1/public/tenants/${TENANT}/logo`,
  primaryColor: "#c2410c",
  secondaryColor: "#1e3a8a",
  motto: "Knowledge first",
  supportEmail: null,
  supportPhone: null,
};

// Staff fixtures for the people and roles screens. Names are invented and identifiers are fixed.
const PERMISSION_CATALOG = [
  {
    area: "Students",
    permissions: [{ name: "students.read", isPlatform: false }],
  },
  {
    area: "Users",
    permissions: [
      { name: "users.invite", isPlatform: false },
      { name: "users.manage", isPlatform: false },
    ],
  },
  {
    area: "Roles",
    permissions: [
      { name: "roles.assign", isPlatform: false },
      { name: "roles.manage", isPlatform: false },
    ],
  },
];

const ROLES = [
  {
    id: "0190a6c2-0000-7000-8000-000000000101",
    name: "SchoolAdmin",
    description: "Every permission in this school",
    isSystem: true,
    permissions: ["students.read", "users.invite", "users.manage", "roles.assign", "roles.manage"],
    memberCount: 1,
  },
  {
    id: "0190a6c2-0000-7000-8000-000000000102",
    name: "Registrar",
    description: "Students and admissions",
    isSystem: true,
    permissions: ["students.read"],
    memberCount: 2,
  },
  {
    id: "0190a6c2-0000-7000-8000-000000000103",
    name: "Finance clerk",
    description: "Reads student records for billing",
    isSystem: false,
    permissions: ["students.read"],
    memberCount: 0,
  },
];

const USERS = [
  {
    id: "0190a6c2-0000-7000-8000-000000000201",
    displayName: "Ada Okafor",
    email: "ada@test.invalid",
    phone: null,
    type: "Staff",
    status: "Active",
    mfaEnabled: true,
    roles: ["SchoolAdmin"],
    lastLoginAt: null,
  },
  {
    id: "0190a6c2-0000-7000-8000-000000000202",
    displayName: "Tunde Bello",
    email: null,
    phone: "+2348000000002",
    type: "Staff",
    status: "Invited",
    mfaEnabled: false,
    roles: ["Registrar"],
    lastLoginAt: null,
  },
  {
    id: "0190a6c2-0000-7000-8000-000000000203",
    displayName: "Ngozi Eze",
    email: "ngozi@test.invalid",
    phone: null,
    type: "Staff",
    status: "Disabled",
    mfaEnabled: false,
    roles: [],
    lastLoginAt: null,
  },
];

function tokens(label: string, n = 1) {
  return {
    accessToken: fakeJwt(label),
    refreshToken: `rt:${label}:${n}`,
    expiresIn: 900,
    tokenType: "Bearer",
  };
}

export function startFakeApi(): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", FAKE_API_URL);
    const path = url.pathname;

    if (path === "/__received") {
      return send(res, 200, received.get(url.searchParams.get("path") ?? "") ?? {});
    }
    if (path === "/__contract") return send(res, 200, violations);

    // Keyed by path and query, so parallel tests can each read their own request.
    received.set(path + url.search, headerSnapshot(req));
    const bodyText = req.method === "GET" ? "" : await readBody(req);
    // Like the real API: a body without a JSON content type is refused (415). Keeps the BFF honest.
    if (bodyText && !String(req.headers["content-type"] ?? "").includes("json")) {
      return send(res, 415, problem("request.unsupported_media_type", "Unsupported media type"));
    }
    // Every API request must match the contract. A mismatch is recorded and fails the run (global
    // teardown), so a test cannot pass against a request the real API would refuse.
    if (path.startsWith("/api/")) {
      const problems = contractProblems(
        req.method ?? "GET",
        path,
        url.searchParams,
        req.headers,
        bodyText,
      );
      if (problems.length > 0) {
        for (const problem of problems)
          violations.push({ method: req.method ?? "GET", path, problem });
        console.error(`CONTRACT VIOLATION ${req.method} ${path}: ${problems.join("; ")}`);
        return send(res, 500, problem("contract.violation", problems.join("; ")));
      }
    }
    const body = (bodyText ? JSON.parse(bodyText) : {}) as Record<string, string | undefined>;
    const label = labelOf(req.headers.authorization);
    const tenantHeader = (req.headers["x-tenant"] as string | undefined) ?? TENANT;

    // Public branding and logo: anonymous, by slug.
    const pub = /^\/api\/v1\/public\/tenants\/([^/]+)\/(branding|logo)$/.exec(path);
    if (pub) {
      if (pub[1] !== TENANT) return send(res, 404, problem("tenancy.not_found", "Not found"));
      if (pub[2] === "logo") {
        res.writeHead(200, { "Content-Type": "image/png" });
        return res.end(PNG);
      }
      return send(res, 200, branding);
    }

    // A signed-in token must match the school named by the BFF.
    if (label && tenantHeader !== TENANT)
      return send(res, 403, problem("tenancy.mismatch", "Wrong school"));

    if (path === "/api/v1/auth/login") {
      const id = body.identifier ?? "";
      if (id === "limited@test.invalid") {
        return send(res, 429, problem("auth.account_locked", "Too many attempts"), {
          "Retry-After": "3",
        });
      }
      if (id === "mfa@test.invalid" && body.password === TEST_PASSWORD) {
        return send(res, 200, {
          accessToken: null,
          refreshToken: null,
          expiresIn: null,
          tokenType: "Bearer",
          mfaRequired: true,
          mfaToken: "mfa-challenge-token-0001",
          mfaEnrollmentRequired: false,
          enrollmentToken: null,
        });
      }
      if (id === "enrol@test.invalid" && body.password === TEST_PASSWORD) {
        return send(res, 200, {
          accessToken: null,
          refreshToken: null,
          expiresIn: null,
          tokenType: "Bearer",
          mfaRequired: false,
          mfaToken: null,
          mfaEnrollmentRequired: true,
          enrollmentToken: "enrol-token-0001",
        });
      }
      const known = ["ok@test.invalid", "suspended@test.invalid", "race@test.invalid"].includes(id);
      if (known && body.password === TEST_PASSWORD) {
        const who = id.split("@")[0] ?? "ok";
        return send(res, 200, {
          ...tokens(who),
          mfaRequired: false,
          mfaToken: null,
          mfaEnrollmentRequired: false,
          enrollmentToken: null,
        });
      }
      return send(res, 401, problem("auth.invalid_credentials", "Invalid credentials"));
    }

    if (path === "/api/v1/auth/mfa/verify") {
      if (body.mfaToken !== "mfa-challenge-token-0001")
        return send(res, 401, problem("auth.token_invalid", "Challenge expired"));
      if (body.code !== "123456")
        return send(res, 401, problem("auth.mfa_invalid", "Code not accepted"));
      return send(res, 200, {
        ...tokens("ok"),
        mfaRequired: false,
        mfaToken: null,
        mfaEnrollmentRequired: false,
        enrollmentToken: null,
      });
    }

    if (path === "/api/v1/auth/mfa/enrollment") {
      if (body.enrollmentToken !== "enrol-token-0001")
        return send(res, 401, problem("auth.token_invalid", "Challenge expired"));
      return send(res, 200, {
        secret: "JBSWY3DPEHPK3PXP",
        otpAuthUri: "otpauth://totp/Greenfield:test?secret=JBSWY3DPEHPK3PXP",
      });
    }

    if (path === "/api/v1/auth/mfa/enrollment/confirm") {
      if (body.code !== "654321")
        return send(res, 401, problem("auth.mfa_invalid", "Code not accepted"));
      return send(res, 200, {
        ...tokens("ok"),
        recoveryCodes: ["AB12-CD34", "EF56-GH78", "IJ90-KL12"],
      });
    }

    if (path === "/api/v1/auth/otp/request") return res.writeHead(202).end();
    if (path === "/api/v1/auth/otp/verify") {
      if (body.code !== "111222")
        return send(res, 401, problem("auth.otp_invalid", "Code not accepted"));
      return send(res, 200, {
        ...tokens("ok"),
        mfaRequired: false,
        mfaToken: null,
        mfaEnrollmentRequired: false,
        enrollmentToken: null,
      });
    }

    if (path === "/api/v1/auth/password/forgot") {
      if (body.identifier === "limited@test.invalid")
        return send(res, 429, problem("rate.limited", "Slow down"), { "Retry-After": "2" });
      return res.writeHead(202).end();
    }
    if (path === "/api/v1/auth/password/reset") {
      if (body.token !== "valid-reset-token-0001")
        return send(res, 400, problem("auth.token_invalid", "Link expired"));
      return res.writeHead(204).end();
    }
    if (path === "/api/v1/auth/invites/accept") {
      if (body.token !== "valid-invite-token-0001")
        return send(res, 400, problem("auth.invite_invalid", "Invitation expired"));
      return res.writeHead(204).end();
    }

    if (path === "/api/v1/auth/refresh") {
      const rt = body.refreshToken ?? "";
      if (rt === "dead")
        return send(res, 401, problem("auth.token_invalid", "Invalid refresh token"));
      if (rt.startsWith("rt:race:") && !raced.has(rt)) {
        raced.add(rt);
        return send(res, 409, problem("auth.refresh_in_flight", "Refresh in flight"), {
          "Retry-After": "1",
        });
      }
      const who = rt.split(":")[1] ?? "ok";
      return send(res, 200, {
        ...tokens(who, 2),
        mfaRequired: false,
        mfaToken: null,
        mfaEnrollmentRequired: false,
        enrollmentToken: null,
      });
    }

    if (path === "/api/v1/auth/logout" || path === "/api/v1/auth/logout-all")
      return res.writeHead(204).end();

    // Authenticated surfaces below. No token is a 401.
    if (path.startsWith("/api/v1/") && !label)
      return send(res, 401, problem("auth.token_invalid", "Unauthorized"));

    const writesBlocked = label === "suspended" && req.method !== "GET";
    if (writesBlocked) return send(res, 402, problem("billing.suspended", "Account suspended"));

    if (path === "/api/v1/me") {
      return send(res, 200, {
        id: "00000000-0000-4000-8000-000000000001",
        tenantId: "00000000-0000-4000-8000-0000000000aa",
        userType: "Staff",
        displayName: "Test User",
        email: "user@test.invalid",
        phone: null,
        emailConfirmed: true,
        phoneConfirmed: false,
        mfaEnabled: label === "ok",
        lastLoginAt: null,
        tenantStatus: label === "suspended" ? "Suspended" : "Active",
        tenantPastDue: false,
        roles: ["Test role"],
        permissions:
          label === "admin"
            ? [
                "me.profile",
                "users.invite",
                "users.manage",
                "roles.assign",
                "roles.manage",
                "students.read",
              ]
            : ["me.profile"],
      });
    }

    if (path === "/api/v1/me/tenant") {
      return send(res, 200, {
        planCode: "standard",
        planName: "Standard",
        entitlements: label === "admin" ? ["customRoles"] : [],
        limits: { maxStudents: 100, maxStaff: 10, smsCreditsMonthly: 0 },
        usage: { students: 0, staff: 1, smsCreditsUsed: 0 },
        status: label === "suspended" ? "Suspended" : "Active",
        pastDue: false,
        suspended: label === "suspended",
        branding,
      });
    }

    if (path === "/api/v1/me/sessions" && req.method === "GET") {
      const now = new Date().toISOString();
      return send(res, 200, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          device: "This device",
          ipAddress: null,
          startedAt: now,
          lastUsedAt: now,
          active: true,
          current: true,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          device: "Other phone",
          ipAddress: null,
          startedAt: now,
          lastUsedAt: now,
          active: true,
          current: false,
        },
      ]);
    }
    if (path.startsWith("/api/v1/me/sessions/") && req.method === "DELETE")
      return res.writeHead(204).end();

    if (path === "/api/v1/me/password") {
      if (body.currentPassword !== TEST_PASSWORD)
        return send(res, 400, problem("auth.password_incorrect", "Current password is wrong"));
      return res.writeHead(204).end();
    }

    if (path === "/api/v1/me/contact/request") return res.writeHead(204).end();
    if (path === "/api/v1/me/contact/confirm") return res.writeHead(204).end();

    if (path === "/api/v1/permissions") {
      return send(res, 200, PERMISSION_CATALOG);
    }

    if (path === "/api/v1/roles" && req.method === "GET") return send(res, 200, ROLES);
    if (path === "/api/v1/roles" && req.method === "POST") {
      const role = {
        id: randomUUID(),
        name: body.name ?? "",
        description: body.description ?? "",
        isSystem: false,
        permissions: (body as unknown as { permissions?: string[] }).permissions ?? [],
        memberCount: 0,
      };
      ROLES.push(role);
      return send(res, 201, role);
    }
    const rolePerms = /^\/api\/v1\/roles\/([^/]+)\/permissions$/.exec(path);
    if (rolePerms && req.method === "PUT") {
      const role = ROLES.find((r) => r.id === rolePerms[1]);
      if (!role) return send(res, 404, problem("roles.not_found", "Role not found"));
      return send(res, 200, { ...role, permissions: body.permissions ?? [] });
    }

    if (path === "/api/v1/users" && req.method === "GET") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const status = url.searchParams.get("status");
      const page = Number(url.searchParams.get("page") ?? "1");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
      const matched = USERS.filter(
        (u) =>
          (q === "" || u.displayName.toLowerCase().includes(q)) &&
          (status === null || status === "" || u.status === status),
      );
      const items = matched.slice((page - 1) * pageSize, page * pageSize);
      return send(res, 200, {
        items,
        page,
        pageSize,
        totalCount: matched.length,
        totalPages: Math.max(1, Math.ceil(matched.length / pageSize)),
      });
    }

    if (path === "/api/v1/users/invite" && req.method === "POST") {
      return send(res, 201, {
        id: "0190a6c2-0000-7000-8000-00000000000b",
        displayName: body.displayName ?? "",
        status: "Invited",
        expiresAt: new Date(Date.now() + 72 * 3600_000).toISOString(),
      });
    }

    if (path === "/api/v1/students" && req.method === "POST") {
      return send(res, 201, { created: true, echo: body });
    }

    if (path === "/api/v1/payments/9/receipt") {
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="receipt-9.pdf"',
        "Set-Cookie": "upstream=leak; Path=/",
      });
      return res.end("%PDF-1.7 fake");
    }

    if (path === "/export.csv") {
      res.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="export.csv"',
      });
      return res.end("a,b\n1,2\n");
    }

    return send(res, 404, problem("students.not_found", "Not found"));
  });
  return new Promise((resolvePromise) =>
    server.listen(FAKE_API_PORT, "127.0.0.1", () => resolvePromise(server)),
  );
}
