// TEST DOUBLE for the .NET API, used only by the e2e and Lighthouse runs. It is NOT the backend.
// Identifiers end in .invalid and passwords are fixed test values; none is a real account.
// It records the headers it receives so tests can assert what the BFF forwards.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { handleAttendance } from "./fake-attendance.ts";
import { handleFees } from "./fake-fees.ts";
import { handleStaff } from "./fake-staff.ts";
import { handleStudents } from "./fake-students.ts";
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
  logoUrl: `/api/v1/public/tenants/${TENANT}/logo`,
  primaryColor: "#c2410c",
  secondaryColor: "#1e3a8a",
  motto: "Knowledge first",
  supportEmail: null,
  supportPhone: null,
};

// Academic fixtures: class levels and their arms.
const LEVELS: Array<{ id: string; code: string; name: string; order: number; section: string }> = [
  {
    id: "0190a6c2-0000-7000-8000-000000000301",
    code: "JSS1",
    name: "Junior Secondary 1",
    order: 1,
    section: "Junior",
  },
];
const ARMS: Array<{
  id: string;
  levelId: string;
  name: string;
  capacity: number;
  formTeacherStaffId: null;
}> = [
  {
    id: "0190a6c2-0000-7000-8000-000000000401",
    levelId: "0190a6c2-0000-7000-8000-000000000301",
    name: "A",
    capacity: 30,
    formTeacherStaffId: null,
  },
];

// Staff fixtures for the people and roles screens. Names are invented and identifiers are fixed.

// Academic setup fixtures (subjects, mappings, grading, assessment, calendar). Identifiers are fixed.
const SUBJECTS: Array<{ id: string; code: string; name: string; category: string }> = [
  {
    id: "0190a6c2-0000-7000-8000-000000000401",
    code: "MTH",
    name: "Mathematics",
    category: "Core",
  },
  { id: "0190a6c2-0000-7000-8000-000000000402", code: "ENG", name: "English", category: "Core" },
  {
    id: "0190a6c2-0000-7000-8000-000000000403",
    code: "CRS",
    name: "Religious Studies",
    category: "Elective",
  },
];
const MAPPINGS: Record<string, Array<{ subjectId: string; isCompulsory: boolean }>> = {};
const GRADING: Array<{
  id: string;
  name: string;
  isDefault: boolean;
  bands: Array<{
    id: string;
    min: number;
    max: number;
    grade: string;
    remark: string;
    gradePoint: number | null;
  }>;
}> = [
  {
    id: "0190a6c2-0000-7000-8000-000000000501",
    name: "Standard grading",
    isDefault: true,
    bands: [
      {
        id: "0190a6c2-0000-7000-8000-000000000511",
        min: 0,
        max: 39,
        grade: "F",
        remark: "Fail",
        gradePoint: 0,
      },
      {
        id: "0190a6c2-0000-7000-8000-000000000512",
        min: 40,
        max: 69,
        grade: "C",
        remark: "Credit",
        gradePoint: 3,
      },
      {
        id: "0190a6c2-0000-7000-8000-000000000513",
        min: 70,
        max: 100,
        grade: "A",
        remark: "Excellent",
        gradePoint: 5,
      },
    ],
  },
];
const ASSESSMENT: Array<{
  id: string;
  name: string;
  isDefault: boolean;
  total: number;
  components: Array<{ id: string; name: string; maxScore: number; weight: number; order: number }>;
}> = [
  {
    id: "0190a6c2-0000-7000-8000-000000000601",
    name: "Termly assessment",
    isDefault: true,
    total: 100,
    components: [
      {
        id: "0190a6c2-0000-7000-8000-000000000611",
        name: "Test",
        maxScore: 20,
        weight: 20,
        order: 1,
      },
      {
        id: "0190a6c2-0000-7000-8000-000000000612",
        name: "Exam",
        maxScore: 80,
        weight: 80,
        order: 2,
      },
    ],
  },
];
const CALENDAR: Array<{ id: string; date: string; type: string; name: string }> = [
  {
    id: "0190a6c2-0000-7000-8000-000000000701",
    date: `${new Date().getUTCFullYear()}-10-01`,
    type: "Holiday",
    name: "Independence Day",
  },
];

// School settings and academic sessions (contract operations, typed since the B-19 renames).
const SCHOOL_PROFILE = {
  name: "Greenfield Academy",
  address: "12 Marina Road, Lagos",
  phones: "+2348000000100",
  email: "office@greenfield.test.invalid",
  logo: "",
  motto: "Knowledge first",
  principalName: "Mrs T. Adeyemi",
  principalSignature: "",
  lga: "Lagos Island",
  state: "Lagos",
  registrationNo: "RC-000001",
};
const BRANDING = {
  primaryColor: "#0f5c4d",
  secondaryColor: "#c2410c",
  logo: "",
  reportCardHeader: "Greenfield Academy",
};
const POLICIES: Record<string, unknown> = {
  adminNoFormat: "GFA/{year}/{seq}",
  receiptNoFormat: "RCP-{seq}",
  invoiceNoFormat: "INV-{seq}",
  "results.requireFeesCleared": false,
  "results.feesClearedThresholdPct": 100,
  "attendance.absenceAlert": true,
  "attendance.excusedCountsAsPresent": true,
  "attendance.lateCutoff": "08:30",
  "notifications.quietHours": "21:00-06:00",
  "security.requireMfaForAdmins": true,
  "security.allowSupportAccess": false,
  timezone: "Africa/Lagos",
};
const ACADEMIC_SESSIONS: Array<{
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  isArchived: boolean;
}> = [
  {
    id: "0190a6c2-0000-7000-8000-000000000801",
    name: "2026/2027",
    startsOn: "2026-09-07",
    endsOn: "2027-07-23",
    isCurrent: true,
    isArchived: false,
  },
];
const TERMS: Array<{
  id: string;
  sessionId: string;
  number: number;
  name: string;
  startsOn: string;
  endsOn: string;
  nextTermBegins: string | null;
  isCurrent: boolean;
}> = [
  {
    id: "0190a6c2-0000-7000-8000-000000000811",
    sessionId: "0190a6c2-0000-7000-8000-000000000801",
    number: 1,
    name: "First term",
    startsOn: "2026-09-07",
    endsOn: "2026-12-18",
    nextTermBegins: "2027-01-11",
    isCurrent: true,
  },
];
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
    // A file's bytes (PUT .../content) are raw, not JSON: they are not parsed.
    const rawUpload = req.method === "PUT" && /\/api\/v1\/files\/[^/]+\/content$/.test(path);
    if (bodyText && !rawUpload && !String(req.headers["content-type"] ?? "").includes("json")) {
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
    let parsed: unknown = {};
    if (bodyText && !rawUpload) {
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        parsed = {};
      }
    }
    const body = parsed as Record<string, string | undefined>;
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

    // Students: records, guardians, documents, notes, files, bulk import and promotions.
    if (
      handleStudents({
        method: req.method ?? "GET",
        path,
        url,
        body: body as Record<string, unknown>,
        res,
        send,
      })
    )
      return;

    // Fees and payments: items, structures, discounts, invoices, payments, reversals, unallocated money and reports.
    if (
      handleFees({
        method: req.method ?? "GET",
        path,
        url,
        body: body as Record<string, unknown>,
        res,
        send,
        label: label ?? "",
        idempotencyKey: req.headers["idempotency-key"] as string | undefined,
      })
    )
      return;

    // Attendance: the register, submit and reopen, the absentees and the summaries.
    if (
      handleAttendance({
        method: req.method ?? "GET",
        path,
        url,
        body: body as Record<string, unknown>,
        res,
        send,
      })
    )
      return;

    // Staff: records, assignments, leave, invitations and class teachers.
    if (
      handleStaff({
        method: req.method ?? "GET",
        path,
        url,
        body: body as Record<string, unknown>,
        res,
        send,
      })
    )
      return;

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
                "academics.read",
                "academics.manage",
                "settings.manage",
                "students.read",
                "students.write",
                "students.sensitive.read",
                "students.delete",
                "students.notes.read",
                "students.notes.write",
                "students.duplicates.override",
                "students.lifecycle.manage",
                "students.import.run",
                "promotions.manage",
                "staff.read",
                "staff.write",
                "staff.assign",
                "attendance.mark",
                "attendance.edit.past",
                "attendance.export",
                "fees.structures.manage",
                "fees.invoices.create",
                "fees.invoices.void",
                "fees.payments.record",
                "fees.payments.reverse",
                "fees.payments.approve",
                "fees.discounts.approve",
                "fees.reports.read",
              ]
            : label === "approver"
              ? [
                  "me.profile",
                  "fees.reports.read",
                  "fees.payments.record",
                  "fees.payments.approve",
                  "fees.discounts.approve",
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

    if (path === "/api/v1/class-levels" && req.method === "GET") return send(res, 200, LEVELS);
    if (path === "/api/v1/class-levels" && req.method === "POST") {
      const level = {
        id: randomUUID(),
        code: body.code ?? "",
        name: body.name ?? "",
        order: Number(body.order ?? 0),
        section: body.section ?? "",
      };
      LEVELS.push(level);
      return send(res, 201, level);
    }
    const levelById = /^\/api\/v1\/class-levels\/([^/]+)$/.exec(path);
    if (levelById && req.method === "PUT") {
      const level = LEVELS.find((l) => l.id === levelById[1]);
      if (!level) return send(res, 404, problem("levels.not_found", "Level not found"));
      Object.assign(level, {
        code: body.code ?? level.code,
        name: body.name ?? level.name,
        order: Number(body.order ?? level.order),
        section: body.section ?? level.section,
      });
      return send(res, 200, level);
    }
    const levelArms = /^\/api\/v1\/class-levels\/([^/]+)\/arms$/.exec(path);
    if (levelArms && req.method === "GET")
      return send(
        res,
        200,
        ARMS.filter((a) => a.levelId === levelArms[1]),
      );
    if (levelArms && req.method === "POST") {
      const arm = {
        id: randomUUID(),
        levelId: levelArms[1] ?? "",
        name: body.name ?? "",
        capacity: Number(body.capacity ?? 0),
        formTeacherStaffId: null,
      };
      ARMS.push(arm);
      return send(res, 201, arm);
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

    const userRoles = /^\/api\/v1\/users\/([^/]+)\/roles$/.exec(path);
    if (userRoles && req.method === "PUT") {
      const user = USERS.find((u) => u.id === userRoles[1]);
      if (!user) return send(res, 404, problem("users.not_found", "User not found"));
      const ids = (body.roleIds ?? []) as string[];
      const named = ids.map((id) => ROLES.find((r) => r.id === id));
      if (named.some((r) => r === undefined))
        return send(res, 422, problem("roles.not_found", "A role does not exist"));
      user.roles = named.map((r) => r?.name ?? "");
      return send(res, 200, user);
    }

    // Academic setup: subjects, mappings, grading, assessment and calendar (contract operations).
    if (path === "/api/v1/subjects" && req.method === "GET") return send(res, 200, SUBJECTS);
    if (path === "/api/v1/subjects" && req.method === "POST") {
      const subject = {
        id: randomUUID(),
        code: body.code ?? "",
        name: body.name ?? "",
        category: body.category ?? "Core",
      };
      SUBJECTS.push(subject);
      return send(res, 201, subject);
    }
    const subjectById = /^\/api\/v1\/subjects\/([^/]+)$/.exec(path);
    if (subjectById && req.method === "PUT") {
      const subject = SUBJECTS.find((x) => x.id === subjectById[1]);
      if (!subject) return send(res, 404, problem("academics.not_found", "Subject not found"));
      Object.assign(subject, {
        code: body.code ?? subject.code,
        name: body.name ?? subject.name,
        category: body.category ?? subject.category,
      });
      return send(res, 200, subject);
    }
    if (subjectById && req.method === "DELETE") {
      const index = SUBJECTS.findIndex((x) => x.id === subjectById[1]);
      if (index < 0) return send(res, 404, problem("academics.not_found", "Subject not found"));
      SUBJECTS.splice(index, 1);
      return res.writeHead(204).end();
    }
    const levelSubjects = /^\/api\/v1\/class-levels\/([^/]+)\/subjects$/.exec(path);
    if (levelSubjects && req.method === "GET")
      return send(res, 200, MAPPINGS[levelSubjects[1] ?? ""] ?? []);
    if (levelSubjects && req.method === "PUT") {
      const rows = (Array.isArray(body) ? body : []) as unknown as Array<{
        subjectId: string;
        isCompulsory: boolean;
      }>;
      MAPPINGS[levelSubjects[1] ?? ""] = rows.map((r) => ({
        subjectId: r.subjectId,
        isCompulsory: r.isCompulsory,
      }));
      return send(res, 200, MAPPINGS[levelSubjects[1] ?? ""]);
    }

    if (path === "/api/v1/grading-schemes" && req.method === "GET") return send(res, 200, GRADING);
    if (path === "/api/v1/grading-schemes" && req.method === "POST") {
      const scheme = { id: randomUUID(), name: body.name ?? "", isDefault: false, bands: [] };
      GRADING.push(scheme);
      return send(res, 201, scheme);
    }
    const gradingBands = /^\/api\/v1\/grading-schemes\/([^/]+)\/bands$/.exec(path);
    if (gradingBands && req.method === "PUT") {
      const scheme = GRADING.find((x) => x.id === gradingBands[1]);
      if (!scheme) return send(res, 404, problem("academics.not_found", "Scheme not found"));
      const rows = Array.isArray(body) ? (body as unknown as Array<Record<string, unknown>>) : [];
      scheme.bands = rows.map((r) => ({
        id: randomUUID(),
        min: Number(r.min),
        max: Number(r.max),
        grade: String(r.grade),
        remark: String(r.remark),
        gradePoint:
          r.gradePoint === null || r.gradePoint === undefined ? null : Number(r.gradePoint),
      }));
      return send(res, 200, scheme);
    }
    const gradingDefault = /^\/api\/v1\/grading-schemes\/([^/]+)\/set-default$/.exec(path);
    if (gradingDefault && req.method === "POST") {
      for (const s of GRADING) s.isDefault = s.id === gradingDefault[1];
      return send(
        res,
        200,
        GRADING.find((s) => s.id === gradingDefault[1]),
      );
    }
    const gradingById = /^\/api\/v1\/grading-schemes\/([^/]+)$/.exec(path);
    if (gradingById && req.method === "DELETE") {
      const index = GRADING.findIndex((x) => x.id === gradingById[1]);
      if (index < 0) return send(res, 404, problem("academics.not_found", "Scheme not found"));
      if (GRADING[index]?.isDefault)
        return send(
          res,
          409,
          problem("grading.default_in_use", "The default scheme cannot be deleted"),
        );
      GRADING.splice(index, 1);
      return res.writeHead(204).end();
    }

    if (path === "/api/v1/assessment-schemes" && req.method === "GET")
      return send(res, 200, ASSESSMENT);
    if (path === "/api/v1/assessment-schemes" && req.method === "POST") {
      const scheme = {
        id: randomUUID(),
        name: body.name ?? "",
        isDefault: false,
        total: 0,
        components: [],
      };
      ASSESSMENT.push(scheme);
      return send(res, 201, scheme);
    }
    const assessmentComponents = /^\/api\/v1\/assessment-schemes\/([^/]+)\/components$/.exec(path);
    if (assessmentComponents && req.method === "PUT") {
      const scheme = ASSESSMENT.find((x) => x.id === assessmentComponents[1]);
      if (!scheme) return send(res, 404, problem("academics.not_found", "Scheme not found"));
      const rows = Array.isArray(body) ? (body as unknown as Array<Record<string, unknown>>) : [];
      const total = rows.reduce((sum, r) => sum + Number(r.maxScore), 0);
      if (total !== 100)
        return send(
          res,
          422,
          problem("assessment.total_not_100", "The maximum scores must add up to 100"),
        );
      scheme.components = rows.map((r) => ({
        id: randomUUID(),
        name: String(r.name),
        maxScore: Number(r.maxScore),
        weight: Number(r.weight),
        order: Number(r.order),
      }));
      scheme.total = total;
      return send(res, 200, scheme);
    }
    const assessmentDefault = /^\/api\/v1\/assessment-schemes\/([^/]+)\/set-default$/.exec(path);
    if (assessmentDefault && req.method === "POST") {
      for (const s of ASSESSMENT) s.isDefault = s.id === assessmentDefault[1];
      return send(
        res,
        200,
        ASSESSMENT.find((s) => s.id === assessmentDefault[1]),
      );
    }

    if (path === "/api/v1/calendar/days" && req.method === "GET") {
      const from = url.searchParams.get("from") ?? "0000-01-01";
      const to = url.searchParams.get("to") ?? "9999-12-31";
      return send(
        res,
        200,
        CALENDAR.filter((d) => d.date >= from && d.date <= to).sort((a, b) =>
          a.date < b.date ? -1 : 1,
        ),
      );
    }
    if (path === "/api/v1/calendar/days" && req.method === "POST") {
      const day = {
        id: randomUUID(),
        date: String(body.date),
        type: String(body.type),
        name: String(body.name),
      };
      CALENDAR.push(day);
      return send(res, 201, day);
    }
    const calendarById = /^\/api\/v1\/calendar\/days\/([^/]+)$/.exec(path);
    if (calendarById && req.method === "DELETE") {
      const index = CALENDAR.findIndex((d) => d.id === calendarById[1]);
      if (index < 0) return send(res, 404, problem("calendar.not_found", "Day not found"));
      CALENDAR.splice(index, 1);
      return res.writeHead(204).end();
    }
    if (path === "/api/v1/calendar/import-holidays" && req.method === "POST") {
      return send(res, 200, { year: Number(body.year), added: 2, skipped: 1 });
    }

    // School settings (reads are typed; PUT bodies are declared as objects).
    if (path === "/api/v1/settings/school-profile" && req.method === "GET")
      return send(res, 200, SCHOOL_PROFILE);
    if (path === "/api/v1/settings/school-profile" && req.method === "PUT") {
      Object.assign(SCHOOL_PROFILE, body);
      return send(res, 200, SCHOOL_PROFILE);
    }
    if (path === "/api/v1/settings/branding" && req.method === "GET")
      return send(res, 200, BRANDING);
    if (path === "/api/v1/settings/branding" && req.method === "PUT") {
      Object.assign(BRANDING, body);
      return send(res, 200, BRANDING);
    }
    if (path === "/api/v1/settings/policies" && req.method === "GET")
      return send(res, 200, POLICIES);
    if (path === "/api/v1/settings/policies" && req.method === "PUT") {
      Object.assign(POLICIES, body);
      return send(res, 200, POLICIES);
    }

    // Academic sessions, terms, school days and rollover.
    if (path === "/api/v1/sessions" && req.method === "GET")
      return send(res, 200, ACADEMIC_SESSIONS);
    if (path === "/api/v1/sessions" && req.method === "POST") {
      const session = {
        id: randomUUID(),
        name: String(body.name),
        startsOn: String(body.startsOn),
        endsOn: String(body.endsOn),
        isCurrent: false,
        isArchived: false,
      };
      ACADEMIC_SESSIONS.push(session);
      return send(res, 201, session);
    }
    const sessionById = /^\/api\/v1\/sessions\/([^/]+)$/.exec(path);
    if (sessionById && req.method === "PUT") {
      const session = ACADEMIC_SESSIONS.find((x) => x.id === sessionById[1]);
      if (!session) return send(res, 404, problem("sessions.not_found", "Session not found"));
      Object.assign(session, {
        name: String(body.name),
        startsOn: String(body.startsOn),
        endsOn: String(body.endsOn),
      });
      return send(res, 200, session);
    }
    const sessionArchive = /^\/api\/v1\/sessions\/([^/]+)\/archive$/.exec(path);
    if (sessionArchive && req.method === "POST") {
      const session = ACADEMIC_SESSIONS.find((x) => x.id === sessionArchive[1]);
      if (!session) return send(res, 404, problem("sessions.not_found", "Session not found"));
      session.isArchived = true;
      return send(res, 200, session);
    }
    const sessionTerms = /^\/api\/v1\/sessions\/([^/]+)\/terms$/.exec(path);
    if (sessionTerms && req.method === "GET")
      return send(
        res,
        200,
        TERMS.filter((t) => t.sessionId === sessionTerms[1]),
      );
    if (sessionTerms && req.method === "POST") {
      const term = {
        id: randomUUID(),
        sessionId: sessionTerms[1] ?? "",
        number: Number(body.number),
        name: String(body.name),
        startsOn: String(body.startsOn),
        endsOn: String(body.endsOn),
        nextTermBegins: (body.nextTermBegins as string | null) ?? null,
        isCurrent: false,
      };
      TERMS.push(term);
      return send(res, 201, term);
    }
    const termById = /^\/api\/v1\/terms\/([^/]+)$/.exec(path);
    if (termById && req.method === "PUT") {
      const term = TERMS.find((x) => x.id === termById[1]);
      if (!term) return send(res, 404, problem("terms.not_found", "Term not found"));
      Object.assign(term, {
        number: Number(body.number),
        name: String(body.name),
        startsOn: String(body.startsOn),
        endsOn: String(body.endsOn),
        nextTermBegins: (body.nextTermBegins as string | null) ?? null,
      });
      return send(res, 200, term);
    }
    const termCurrent = /^\/api\/v1\/terms\/([^/]+)\/set-current$/.exec(path);
    if (termCurrent && req.method === "POST") {
      const term = TERMS.find((x) => x.id === termCurrent[1]);
      if (!term) return send(res, 404, problem("terms.not_found", "Term not found"));
      for (const x of TERMS) if (x.sessionId === term.sessionId) x.isCurrent = x.id === term.id;
      return send(res, 200, term);
    }
    const termDays = /^\/api\/v1\/terms\/([^/]+)\/school-days$/.exec(path);
    if (termDays && req.method === "GET") {
      const term = TERMS.find((x) => x.id === termDays[1]);
      if (!term) return send(res, 404, problem("terms.not_found", "Term not found"));
      return send(res, 200, {
        termId: term.id,
        startsOn: term.startsOn,
        endsOn: term.endsOn,
        totalDays: 105,
        weekendDays: 30,
        closedDays: 5,
        schoolDays: 70,
      });
    }
    if (path === "/api/v1/academics/rollover" && req.method === "POST") {
      const session = {
        id: randomUUID(),
        name: String(body.name),
        startsOn: String(body.startsOn),
        endsOn: String(body.endsOn),
        isCurrent: false,
        isArchived: false,
      };
      ACADEMIC_SESSIONS.push(session);
      return send(res, 201, session);
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
