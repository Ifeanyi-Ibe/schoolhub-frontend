// Fees and payments (F6) against the real backend. It creates only e2e records: a fee item, a draft structure, a discount,
// one student, a grant, and one manual payment. Invoices are not generated (that would bill real students). It checks that a
// retried payment is recorded once, and that a reversal cannot be approved by the person who asked for it.
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

test.describe.serial("fees against the real backend", () => {
  const tag = Date.now().toString(36);
  let itemId = "";
  let sessionId = "";
  let levelId = "";
  let studentId = "";
  let discountId = "";
  let paymentId = "";
  const paymentKey = randomUUID();

  test("a fee item and a draft structure are created; the structure is still a draft", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const item = await request.post(url("/api/v1/fees/items"), {
      headers: jsonHeaders(admin),
      data: { name: `E2E fee ${tag}`, category: "Other", isMandatoryDefault: false },
      failOnStatusCode: false,
    });
    expect(item.status(), await item.text()).toBe(201);
    itemId = ((await item.json()) as { id: string }).id;

    const sessions = (await (
      await request.get(url("/api/v1/sessions"), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string }>;
    sessionId = sessions[0]?.id ?? "";
    const levels = (await (
      await request.get(url("/api/v1/class-levels"), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string }>;
    levelId = levels[0]?.id ?? "";
    expect(sessionId && levelId, "the seed has a session and a level").not.toBe("");

    const structure = await request.post(url("/api/v1/fees/structures"), {
      headers: jsonHeaders(admin),
      data: {
        sessionId,
        termId: null,
        classLevelId: levelId,
        name: `E2E structure ${tag}`,
        lines: [{ feeItemId: itemId, amountKobo: 1500050, isOptional: false }],
      },
      failOnStatusCode: false,
    });
    expect(structure.status(), await structure.text()).toBe(201);
    const made = (await structure.json()) as { id: string; status: string; totalKobo: number };
    expect(made.status).toBe("Draft");
    expect(made.totalKobo).toBe(1500050);
  });

  test("a discount is created, a student is enrolled, and the discount is granted once for a retried action", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const discount = await request.post(url("/api/v1/fees/discounts"), {
      headers: jsonHeaders(admin),
      data: { name: `E2E discount ${tag}`, kind: "Fixed", value: 50000, requiresApproval: false },
      failOnStatusCode: false,
    });
    expect(discount.status(), await discount.text()).toBe(201);
    discountId = ((await discount.json()) as { id: string }).id;

    const arms = (await (
      await request.get(url(`/api/v1/class-levels/${levelId}/arms`), { headers: apiHeaders(admin) })
    ).json()) as Array<{ id: string }>;
    const classArmId = arms[0]?.id ?? null;
    const created = await request.post(url("/api/v1/students"), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": randomUUID() },
      data: {
        admissionNo: null,
        firstName: "E2E",
        middleName: null,
        lastName: `Fee${tag}`,
        gender: "Male",
        dateOfBirth: "2015-05-05",
        address: null,
        admittedOn: "2026-09-07",
        sessionId,
        classArmId,
        medicalNotes: null,
        specialNeedsNotes: null,
        guardians: [
          {
            firstName: "E2E",
            lastName: `Fee${tag}`,
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

    const key = randomUUID();
    const first = await request.post(url(`/api/v1/students/${studentId}/discounts`), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": key },
      data: { discountId, termId: null },
      failOnStatusCode: false,
    });
    expect(first.status(), await first.text()).toBe(201);
    const again = await request.post(url(`/api/v1/students/${studentId}/discounts`), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": key },
      data: { discountId, termId: null },
      failOnStatusCode: false,
    });
    expect(again.status(), await again.text()).toBe(201);
    expect(((await again.json()) as { id: string }).id).toBe(
      ((await first.json()) as { id: string }).id,
    );
  });

  test("a payment is recorded once when its action is retried with the same key", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const body = {
      studentId,
      amountKobo: 500000,
      method: "Cash",
      reference: `E2E-${tag}`,
      paidOn: null,
    };
    const first = await request.post(url("/api/v1/payments/manual"), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": paymentKey },
      data: body,
      failOnStatusCode: false,
    });
    expect(first.status(), await first.text()).toBe(201);
    paymentId = ((await first.json()) as { id: string }).id;

    const retry = await request.post(url("/api/v1/payments/manual"), {
      headers: { ...jsonHeaders(admin), "Idempotency-Key": paymentKey },
      data: body,
      failOnStatusCode: false,
    });
    expect(retry.status(), await retry.text()).toBeLessThan(300);
    expect(((await retry.json()) as { id: string }).id).toBe(paymentId);

    const ledger = (await (
      await request.get(url(`/api/v1/students/${studentId}/ledger`), { headers: apiHeaders(admin) })
    ).json()) as {
      lines: Array<{ creditKobo: number }>;
    };
    const credits = ledger.lines.filter((l) => Number(l.creditKobo) === 500000);
    expect(credits.length, "the payment appears once in the ledger").toBe(1);
  });

  test("a reversal asked for by the same person cannot be approved by them", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const asked = await request.post(url(`/api/v1/payments/${paymentId}/reverse-request`), {
      headers: jsonHeaders(admin),
      data: { reason: "E2E check of the maker-checker rule" },
      failOnStatusCode: false,
    });
    expect(asked.status(), await asked.text()).toBe(200);

    const approved = await request.post(url(`/api/v1/payments/${paymentId}/reverse-approve`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(approved.status(), await approved.text()).toBe(422);
    expect(((await approved.json()) as { code: string }).code).toBe("fees.maker_checker");
  });

  test("the fee reports answer: collection, debtors and reconciliation", async ({ request }) => {
    const admin = await adminAccessToken(request);
    const collection = await request.get(
      url("/api/v1/fees/reports/collection?from=2026-01-01&to=2026-12-31"),
      { headers: apiHeaders(admin), failOnStatusCode: false },
    );
    expect(collection.status(), await collection.text()).toBe(200);
    const debtors = await request.get(url("/api/v1/fees/reports/debtors"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(debtors.status(), await debtors.text()).toBe(200);
    const reconciliation = await request.get(url("/api/v1/fees/reconciliation"), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(reconciliation.status(), await reconciliation.text()).toBe(200);
  });
});
