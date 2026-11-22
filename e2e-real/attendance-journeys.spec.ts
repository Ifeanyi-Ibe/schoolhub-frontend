// Attendance (F5) against the real backend. It enrols one e2e student in the seed's class, takes the register on the next
// school day the server reports, saves a mark, shows the server's per-row answer for a stale save, submits, reopens with
// a reason, and reads the reports. Only e2e records are created.
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

function isoDay(offset: number): string {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test.describe.serial("attendance against the real backend", () => {
  const tag = Date.now().toString(36);
  let classArmId = "";
  let sessionId = "";
  let termId = "";
  let studentId = "";
  let date = "";
  let current: { id: string; startsOn: string; endsOn: string } | undefined;

  test("a student is enrolled in the seed class, and the register is read for a school day", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const sessions = (await (
      await request.get(url("/api/v1/sessions"), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string; isCurrent: boolean; startsOn: string; endsOn: string }>;
    current = sessions.find((x) => x.isCurrent) ?? sessions[0];
    sessionId = current?.id ?? "";
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

    const created = await request.post(url("/api/v1/students"), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": randomUUID() },
      data: {
        admissionNo: null,
        firstName: "E2E",
        middleName: null,
        lastName: `Att${tag}`,
        gender: "Female",
        dateOfBirth: "2015-03-03",
        address: null,
        admittedOn: "2026-09-07",
        sessionId,
        classArmId,
        medicalNotes: null,
        specialNeedsNotes: null,
        guardians: [
          {
            firstName: "E2E",
            lastName: `Att${tag}`,
            phone: `080${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
            email: null,
            relationship: "Mother",
            isPrimaryPayer: true,
            isEmergencyContact: true,
            canPickup: true,
            priority: 1,
          },
        ],
      },
      failOnStatusCode: false,
    });
    expect(created.status(), await created.text()).toBe(201);
    studentId = ((await created.json()) as { student: { id: string } }).student.id;

    // Register days are school days only inside a term. The seed may have none: one is added around today if so.
    const terms = (await (
      await request.get(url(`/api/v1/sessions/${sessionId}/terms`), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string }>;
    if (terms.length === 0) {
      const term = await request.post(url(`/api/v1/sessions/${sessionId}/terms`), {
        headers: apiHeaders(admin),
        data: {
          number: 1,
          name: `E2E term ${tag}`,
          startsOn: isoDay(-7) < current!.startsOn ? current!.startsOn : isoDay(-7),
          endsOn: isoDay(30) > current!.endsOn ? current!.endsOn : isoDay(30),
          nextTermBegins: null,
        },
        failOnStatusCode: false,
      });
      expect(term.status(), await term.text()).toBe(201);
      termId = ((await term.json()) as { id: string }).id;
    } else {
      termId = terms[0]!.id;
    }
    expect(termId, "a term for the session").not.toBe("");

    // The most recent school day the server reports, within two weeks back (weekends and holidays are not registers).
    for (let offset = 0; offset < 14 && date === ""; offset++) {
      const day = isoDay(-offset); // the backend refuses marks for a future day
      const view = await request.get(
        url(`/api/v1/attendance/class-arms/${classArmId}?date=${day}`),
        { headers: apiHeaders(admin), failOnStatusCode: false },
      );
      if (view.status() === 200 && ((await view.json()) as { isSchoolDay: boolean }).isSchoolDay)
        date = day;
    }
    expect(date, "a school day within two weeks").not.toBe("");
  });

  test("a mark is saved, and a stale save for the same student is answered as ignored", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const now = new Date();
    const fresh = await request.put(url(`/api/v1/attendance/class-arms/${classArmId}/${date}`), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": randomUUID() },
      data: {
        period: null,
        reason: "E2E check: the register may be a past day, which needs a reason",
        entries: [
          {
            studentId,
            status: "Present",
            arrivalTime: null,
            note: null,
            clientId: randomUUID(),
            clientUpdatedAt: now.toISOString(),
          },
        ],
      },
      failOnStatusCode: false,
    });
    expect(fresh.status(), await fresh.text()).toBe(200);
    const freshOutcome = (await fresh.json()) as {
      applied: number;
      rows: Array<{ result: string }>;
    };
    expect(freshOutcome.rows[0]?.result.toLowerCase()).toMatch(/^applied$/i);

    const stale = await request.put(url(`/api/v1/attendance/class-arms/${classArmId}/${date}`), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": randomUUID() },
      data: {
        period: null,
        reason: "E2E check: the register may be a past day, which needs a reason",
        entries: [
          {
            studentId,
            status: "Absent",
            arrivalTime: null,
            note: null,
            clientId: randomUUID(),
            clientUpdatedAt: new Date(now.getTime() - 60_000).toISOString(),
          },
        ],
      },
      failOnStatusCode: false,
    });
    expect(stale.status(), await stale.text()).toBe(200);
    // The server's spelling of the result differs from the spec's (BACKEND_GAPS B-38); the meaning is what matters.
    expect(
      ((await stale.json()) as { rows: Array<{ result: string }> }).rows[0]?.result.toLowerCase(),
    ).toMatch(/^ignored/);
  });

  test("the register is submitted, and the submitted register is reopened with a reason", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const submitted = await request.post(
      url(`/api/v1/attendance/class-arms/${classArmId}/${date}/submit`),
      {
        headers: apiHeaders(admin),
        failOnStatusCode: false,
      },
    );
    expect(submitted.status(), await submitted.text()).toBe(200);
    const outcome = (await submitted.json()) as {
      sessionStatus: string;
      alreadySubmitted: boolean;
    };
    expect(outcome.sessionStatus).not.toBe("");

    const reopened = await request.post(
      url(`/api/v1/attendance/class-arms/${classArmId}/${date}/reopen`),
      {
        headers: jsonHeaders(admin),
        data: { period: null, reason: "E2E check of the reopen rule" },
        failOnStatusCode: false,
      },
    );
    expect(reopened.status(), await reopened.text()).toBe(200);
  });

  test("the reports answer: absentees, the class summary and the term summary, and the spreadsheet downloads", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const absentees = await request.get(
      url(`/api/v1/attendance/class-arms/${classArmId}/absentees?date=${date}`),
      { headers: apiHeaders(admin), failOnStatusCode: false },
    );
    expect(absentees.status(), await absentees.text()).toBe(200);

    const summary = await request.get(
      url(`/api/v1/attendance/class-arms/${classArmId}/class-summary?from=${date}&to=${date}`),
      { headers: apiHeaders(admin), failOnStatusCode: false },
    );
    expect(summary.status(), await summary.text()).toBe(200);

    const term = await request.get(
      url(`/api/v1/attendance/class-arms/${classArmId}/term-summary?termId=${termId}`),
      { headers: apiHeaders(admin), failOnStatusCode: false },
    );
    expect(term.status(), await term.text()).toBe(200);
    const rows = ((await term.json()) as { students: Array<{ studentId: string }> }).students;
    expect(rows.map((r) => r.studentId)).toContain(studentId);

    const xlsx = await request.get(
      url(`/api/v1/attendance/class-arms/${classArmId}/term-summary.xlsx?termId=${termId}`),
      { headers: apiHeaders(admin), failOnStatusCode: false },
    );
    expect(xlsx.status(), await xlsx.text()).toBe(200);
    expect(xlsx.headers()["content-type"] ?? "").toContain("spreadsheetml");
  });
});
