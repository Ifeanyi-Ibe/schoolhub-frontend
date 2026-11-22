// Staff (F4) against the real backend. Creates only e2e records (staff members, a leave request, an invitation), reads
// each back from the API, and leaves the seed's own records alone.
import { randomUUID } from "node:crypto";
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const apiHeaders = (token: string) => ({
  "X-Bff-Key": e2e.bffKey,
  "X-Tenant": e2e.schoolSlug,
  Authorization: `Bearer ${token}`,
});
const jsonHeaders = (token: string) => ({
  ...apiHeaders(token),
  "Content-Type": "application/json",
});

/** A phone number unique to this run: the backend ties a phone to one account, so a fixed number collides on re-runs. */
const runPhone = () => `080${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

const staffBody = (last: string, jobTitle: string) => ({
  firstName: "E2E",
  middleName: null,
  lastName: last,
  gender: "Male",
  dateOfBirth: "1990-04-12",
  phone: runPhone(),
  email: null,
  address: null,
  staffType: "Teaching",
  jobTitle,
  department: null,
  employmentType: "FullTime",
  hireDate: "2026-09-07",
});

test.describe.serial("staff against the real backend", () => {
  const tag = Date.now().toString(36);
  const last = `E2E${tag}`;
  let staffId = "";
  let otherStaffId = "";
  let sessionId = "";
  let classArmId = "";

  test("a staff member is created, updated and read back", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const created = await request.post(url("/api/v1/staff"), {
      headers: jsonHeaders(admin),
      data: staffBody(last, "Mathematics teacher"),
      failOnStatusCode: false,
    });
    expect(created.status(), await created.text()).toBe(201);
    staffId = ((await created.json()) as { id: string }).id;

    const updated = await request.put(url(`/api/v1/staff/${staffId}`), {
      headers: jsonHeaders(admin),
      data: { ...staffBody(last, "Head of mathematics"), address: "9 Broad Street, Lagos" },
      failOnStatusCode: false,
    });
    expect(updated.status(), await updated.text()).toBe(200);

    const read = (await (
      await request.get(url(`/api/v1/staff/${staffId}`), { headers: apiHeaders(admin) })
    ).json()) as { lastName: string; jobTitle: string; address: string | null };
    expect(read.lastName).toBe(last);
    expect(read.jobTitle).toBe("Head of mathematics");
    expect(read.address).toBe("9 Broad Street, Lagos");
  });

  test("the list finds the new member by name, and the staff type filter applies", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const found = (await (
      await request.get(url(`/api/v1/staff?q=${encodeURIComponent(last)}`), {
        headers: apiHeaders(admin),
      })
    ).json()) as { items: Array<{ id: string }> };
    expect(found.items.map((i) => i.id)).toContain(staffId);

    const admins = (await (
      await request.get(url("/api/v1/staff?staffType=Admin"), { headers: apiHeaders(admin) })
    ).json()) as { items: Array<{ id: string }> };
    expect(admins.items.map((i) => i.id)).not.toContain(staffId);
  });

  test("a class and subject are assigned for the session, and read back", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const sessions = (await (
      await request.get(url("/api/v1/sessions"), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string }>;
    sessionId = sessions[0]?.id ?? "";
    expect(sessionId, "the seed has a session").not.toBe("");
    const levels = (await (
      await request.get(url("/api/v1/class-levels"), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string }>;
    const arms = (await (
      await request.get(url(`/api/v1/class-levels/${levels[0]!.id}/arms`), {
        headers: apiHeaders(admin),
      })
    ).json()) as Array<{ id: string }>;
    classArmId = arms[0]?.id ?? "";
    expect(classArmId, "the seed has a class arm").not.toBe("");
    // A class arm of this run, so the form-teacher checks do not depend on an earlier run's assignments.
    const arm = await request.post(url(`/api/v1/class-levels/${levels[0]!.id}/arms`), {
      headers: jsonHeaders(admin),
      data: { name: `E2E ${tag}`, capacity: 30, formTeacherStaffId: null },
      failOnStatusCode: false,
    });
    expect(arm.status(), await arm.text()).toBe(201);
    classArmId = ((await arm.json()) as { id: string }).id;

    const saved = await request.put(
      url(`/api/v1/staff/${staffId}/assignments?sessionId=${sessionId}`),
      {
        headers: jsonHeaders(admin),
        data: [{ classArmId, subjectId: null, isFormTeacher: true }],
        failOnStatusCode: false,
      },
    );
    expect(saved.status(), await saved.text()).toBe(200);

    const read = (await (
      await request.get(url(`/api/v1/staff/${staffId}/assignments?sessionId=${sessionId}`), {
        headers: apiHeaders(admin),
      })
    ).json()) as Array<{ classArmId: string; isFormTeacher: boolean }>;
    expect(read.map((r) => r.classArmId)).toContain(classArmId);
    expect(read.find((r) => r.classArmId === classArmId)?.isFormTeacher).toBe(true);

    const teachers = (await (
      await request.get(url(`/api/v1/class-arms/${classArmId}/teachers?sessionId=${sessionId}`), {
        headers: apiHeaders(admin),
      })
    ).json()) as Array<{ staffId: string; isFormTeacher: boolean }>;
    expect(teachers.map((t) => t.staffId)).toContain(staffId);
  });

  test("a second form teacher for the same class is refused by the API", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const other = await request.post(url("/api/v1/staff"), {
      headers: jsonHeaders(admin),
      data: staffBody(`${last}B`, "Biology teacher"),
      failOnStatusCode: false,
    });
    expect(other.status()).toBe(201);
    otherStaffId = ((await other.json()) as { id: string }).id;

    const refused = await request.put(
      url(`/api/v1/staff/${otherStaffId}/assignments?sessionId=${sessionId}`),
      {
        headers: jsonHeaders(admin),
        data: [{ classArmId, subjectId: null, isFormTeacher: true }],
        failOnStatusCode: false,
      },
    );
    expect(refused.status()).toBe(409);
  });

  test("a leave request is made and approved; the decision time is recorded", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const requested = await request.post(url(`/api/v1/staff/${staffId}/leave`), {
      headers: jsonHeaders(admin),
      data: { leaveType: `Study ${tag}`, startsOn: "2026-12-10", endsOn: "2026-12-12" },
      failOnStatusCode: false,
    });
    expect(requested.status(), await requested.text()).toBe(201);
    const leaveId = ((await requested.json()) as { id: string }).id;

    const approved = await request.post(url(`/api/v1/leave/${leaveId}/approve`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(approved.status(), await approved.text()).toBe(200);
    expect(((await approved.json()) as { decidedAt: string | null }).decidedAt).not.toBeNull();

    const listed = (await (
      await request.get(url(`/api/v1/staff/${staffId}/leave`), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string; decidedAt: string | null }>;
    expect(listed.find((l) => l.id === leaveId)?.decidedAt).not.toBeNull();
  });

  test("an invitation is accepted by the API for a role the school has", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const roles = (await (
      await request.get(url("/api/v1/roles"), { headers: apiHeaders(admin) })
    ).json()) as Array<{ name: string }>;
    const roleName = roles[0]?.name ?? "";
    expect(roleName, "the seed has a role").not.toBe("");

    const invited = await request.post(url(`/api/v1/staff/${staffId}/invite-user`), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": randomUUID() },
      data: { email: `e2e-${tag}@example.test`, phone: null, roleNames: [roleName] },
      failOnStatusCode: false,
    });
    expect(invited.status(), await invited.text()).toBe(202);
  });

  test("a member is deactivated and reactivated", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const off = await request.post(url(`/api/v1/staff/${otherStaffId}/deactivate`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(off.status(), await off.text()).toBe(200);
    const on = await request.post(url(`/api/v1/staff/${otherStaffId}/reactivate`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(on.status(), await on.text()).toBe(200);
  });

  test("my assignments answer for the signed-in administrator", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const mine = await request.get(url(`/api/v1/me/assignments?sessionId=${sessionId}`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(mine.status(), await mine.text()).toBe(200);
  });
});
