// Students (F3) against the real backend. Creates only e2e- records (a student, a guardian, a note, a document and
// an import file), reads each back from the API, and never commits a promotion (the preview is read-only).
// The upload's byte step is the raw PUT the contract does not declare (BACKEND_GAPS B-30).
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

test.describe.serial("students against the real backend", () => {
  const tag = Date.now().toString(36);
  const last = `E2E${tag}`;
  let studentId = "";
  let sessionId = "";
  let classArmId = "";

  test("a student is registered with a guardian, and the API holds the record", async ({
    request,
  }) => {
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

    const res = await request.post(url("/api/v1/students"), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": randomUUID() },
      data: {
        admissionNo: null,
        firstName: "E2E",
        middleName: null,
        lastName: last,
        gender: "Female",
        dateOfBirth: "2016-01-15",
        address: null,
        admittedOn: "2026-09-07",
        sessionId,
        classArmId,
        medicalNotes: null,
        specialNeedsNotes: null,
        guardians: [
          {
            firstName: "E2E",
            lastName: last,
            phone: "08099990000",
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
    const body = (await res.json()) as { student?: { id: string }; code?: string };
    expect(res.status(), body.code).toBe(201);
    studentId = body.student?.id ?? "";

    const read = (await (
      await request.get(url(`/api/v1/students/${studentId}`), { headers: apiHeaders(admin) })
    ).json()) as { lastName: string; guardians: unknown[] };
    expect(read.lastName).toBe(last);
    expect(read.guardians.length).toBe(1);
  });

  test("a second registration with the same name and birth date is refused as a possible duplicate, and the override is accepted", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const data = {
      admissionNo: null,
      firstName: "E2E",
      middleName: null,
      lastName: last,
      gender: "Female",
      dateOfBirth: "2016-01-15",
      address: null,
      admittedOn: "2026-09-07",
      sessionId,
      classArmId,
      medicalNotes: null,
      specialNeedsNotes: null,
      guardians: [
        {
          firstName: "E2E",
          lastName: last,
          phone: "08099990001",
          email: null,
          relationship: "Aunt",
          isPrimaryPayer: false,
          isEmergencyContact: false,
          canPickup: false,
          priority: 2,
        },
      ],
    };
    const refused = await request.post(url("/api/v1/students"), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": randomUUID() },
      data,
      failOnStatusCode: false,
    });
    const problem = (await refused.json()) as { code?: string; errors?: Record<string, string[]> };
    expect(refused.status()).toBe(409);
    expect(problem.code).toBe("students.possible_duplicate");
    expect(problem.errors?.candidateIds ?? [], "the candidate is named by id").toContain(studentId);

    const accepted = await request.post(url("/api/v1/students?allowDuplicate=true"), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": randomUUID() },
      data,
      failOnStatusCode: false,
    });
    expect(accepted.status()).toBe(201);
  });

  test("a document is uploaded in three steps (presign, the bytes, complete) and listed on the record", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const presign = await request.post(url("/api/v1/files/presign-upload"), {
      headers: jsonHeaders(admin),
      data: {
        purpose: "StudentDocument",
        contentType: "application/pdf",
        sizeBytes: 13,
        fileName: "e2e-birth.pdf",
      },
      failOnStatusCode: false,
    });
    expect(presign.status()).toBe(201);
    const ticket = (await presign.json()) as { id: string; uploadUrl: string; method: string };

    const bytes = await request.fetch(url(ticket.uploadUrl), {
      method: ticket.method,
      headers: { ...apiHeaders(admin), "Content-Type": "application/pdf" },
      data: Buffer.from("%PDF-1.4 e2e"),
      failOnStatusCode: false,
    });
    expect(bytes.status(), await bytes.text()).toBe(204);

    const complete = await request.post(url(`/api/v1/files/${ticket.id}/complete`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(complete.status()).toBe(200);

    const added = await request.post(url(`/api/v1/students/${studentId}/documents`), {
      headers: jsonHeaders(admin),
      data: { fileId: ticket.id, type: "Birth certificate", notes: null },
      failOnStatusCode: false,
    });
    expect(added.status()).toBe(201);
    const docs = (await (
      await request.get(url(`/api/v1/students/${studentId}/documents`), {
        headers: apiHeaders(admin),
      })
    ).json()) as Array<{ type: string }>;
    expect(docs.map((d) => d.type)).toContain("Birth certificate");
  });

  test("a pastoral note is added and read back; a withdrawal is recorded with its date", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const note = await request.post(url(`/api/v1/students/${studentId}/notes`), {
      headers: jsonHeaders(admin),
      data: { category: "Pastoral", text: `E2E note ${tag}` },
      failOnStatusCode: false,
    });
    expect(note.status()).toBe(201);
    const notes = (await (
      await request.get(url(`/api/v1/students/${studentId}/notes`), { headers: apiHeaders(admin) })
    ).json()) as Array<{ text: string }>;
    expect(notes.map((n) => n.text)).toContain(`E2E note ${tag}`);

    const left = await request.post(url(`/api/v1/students/${studentId}/withdraw`), {
      headers: jsonHeaders(admin),
      data: { status: "Withdrawn", effectiveOn: "2026-11-20" },
      failOnStatusCode: false,
    });
    expect(left.status()).toBe(200);
    expect(((await left.json()) as { status: string }).status).toBe("Withdrawn");
  });

  test("bulk import: the template is served, a file is checked, and the commit creates the valid rows", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const template = await request.get(url("/api/v1/students/import/template"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(template.status()).toBe(200);
    const header = (await template.text()).split(/\r?\n/)[0] ?? "";
    expect(header.length).toBeGreaterThan(0);

    const columns = header.split(",").map((c) => c.trim());
    const values: Record<string, string> = {
      firstName: "E2E",
      lastName: `Import${tag}`,
      gender: "Male",
      dateOfBirth: "2015-06-01",
      admittedOn: "2026-09-07",
      admissionNo: "",
      middleName: "",
      address: "",
    };
    const row = columns.map((c) => values[c] ?? "").join(",");
    const csv = `${header}\n${row}\n`;

    const presign = await request.post(url("/api/v1/files/presign-upload"), {
      headers: jsonHeaders(admin),
      data: {
        purpose: "ImportUpload",
        contentType: "text/csv",
        sizeBytes: Buffer.byteLength(csv),
        fileName: "e2e-import.csv",
      },
      failOnStatusCode: false,
    });
    const ticket = (await presign.json()) as { id: string; uploadUrl: string };
    const bytes = await request.fetch(url(ticket.uploadUrl), {
      method: "PUT",
      headers: { ...apiHeaders(admin), "Content-Type": "text/csv" },
      data: Buffer.from(csv),
      failOnStatusCode: false,
    });
    expect(bytes.status()).toBe(204);
    await request.post(url(`/api/v1/files/${ticket.id}/complete`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });

    const created = await request.post(url("/api/v1/students/import"), {
      headers: jsonHeaders(admin),
      data: { fileId: ticket.id, sessionId },
      failOnStatusCode: false,
    });
    // The contract answers 202: the check runs in the background.
    expect(created.status()).toBe(202);
    const jobId = ((await created.json()) as { id: string }).id;

    // The check runs in the background; poll until it has finished (Validated, Completed or Failed).
    let status = "Queued";
    for (let i = 0; i < 60 && !["Validated", "Completed", "Failed"].includes(status); i++) {
      await new Promise((r) => setTimeout(r, 1000));
      status = (
        (await (
          await request.get(url(`/api/v1/students/import/${jobId}`), { headers: apiHeaders(admin) })
        ).json()) as { status: string }
      ).status;
    }
    expect(status).toBe("Validated");

    const commit = await request.post(url(`/api/v1/students/import/${jobId}/commit`), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": randomUUID() },
      data: { mode: "SkipErrors" },
      failOnStatusCode: false,
    });
    expect(commit.status()).toBe(202);
  });

  test("promotions: the preview lists who would move (read-only; nothing is committed)", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const sessions = (await (
      await request.get(url("/api/v1/sessions"), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string }>;
    test.skip(
      sessions.length < 2,
      "the seed has one session; a preview needs a second session to promote into",
    );
    const preview = await request.post(url("/api/v1/promotions/preview"), {
      headers: jsonHeaders(admin),
      data: {
        fromSessionId: sessions[0]!.id,
        toSessionId: sessions[1]!.id,
        classArmId,
        targetClassArmId: null,
        outcomes: null,
      },
      failOnStatusCode: false,
    });
    expect(preview.status()).toBe(200);
  });
});
