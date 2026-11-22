// Test double for fees and payments: fee items, structures, discounts, invoices, payments, reversals (maker-checker),
// unallocated money, the ledger and the reports. It keeps the rules the screens rely on: integer kobo, a payment
// reversed only after a request by someone else is approved, and a refusal of a self-approval. State is in memory.
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { SCHOOL_ORIGIN } from "./origin.ts";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface FeesCall {
  method: string;
  path: string;
  url: URL;
  body: Record<string, unknown>;
  res: ServerResponse;
  send: Send;
  label: string;
  idempotencyKey?: string | undefined;
}

const problem = (status: number, code: string, title: string) => ({
  type: `urn:schoolhub:error:${code}`,
  title,
  status,
  detail: title,
  code,
});

export const FEE_STUDENT = "0190a6c2-0000-7000-8000-000000000e01";
const TERM = "0190a6c2-0000-7000-8000-000000000811";
const SESSION = "0190a6c2-0000-7000-8000-000000000801";
const LEVEL = "0190a6c2-0000-7000-8000-000000000301";

interface Item {
  id: string;
  name: string;
  category: string;
  isMandatoryDefault: boolean;
}
interface Line {
  feeItemId: string;
  feeItemName: string;
  amountKobo: number;
  isOptional: boolean;
}
interface Structure {
  id: string;
  sessionId: string;
  termId: string | null;
  classLevelId: string;
  name: string;
  status: "Draft" | "Active";
  lines: Line[];
}
interface Discount {
  id: string;
  name: string;
  kind: "Percentage" | "Fixed";
  value: number;
  requiresApproval: boolean;
}
interface Grant {
  id: string;
  studentId: string;
  discountId: string;
  termId: string | null;
  status: string;
  requestedBy: string;
  approvedBy: string | null;
}
interface InvoiceLine {
  description: string;
  amountKobo: number;
}
interface Invoice {
  id: string;
  invoiceNo: string;
  studentId: string;
  termId: string;
  status: "Draft" | "Issued" | "Paid" | "Overdue" | "Void";
  issuedAt: string;
  dueDate: string;
  subtotalKobo: number;
  discountKobo: number;
  adjustmentKobo: number;
  totalKobo: number;
  paidKobo: number;
  balanceKobo: number;
  voidReason: string | null;
  lines: InvoiceLine[];
}
interface Payment {
  id: string;
  receiptNo: string | null;
  studentId: string | null;
  amountKobo: number;
  method: string;
  reference: string;
  status: "Pending" | "Succeeded" | "Reversed" | "ReversalRequested";
  paidAt: string | null;
  gatewayTransactionId: string | null;
  reversalRequested: boolean;
  reversalReason: string | null;
  reversedAt: string | null;
  requestedBy: string | null;
}
interface Unallocated {
  id: string;
  amountKobo: number;
  reference: string;
  provider: string;
  gatewayTransactionId: string | null;
  receivedAt: string;
  isOpen: boolean;
  assignedStudentId: string | null;
}

const items: Item[] = [
  {
    id: "0190a6c2-0000-7000-8000-000000000f01",
    name: "Tuition",
    category: "Tuition",
    isMandatoryDefault: true,
  },
];
const structures: Structure[] = [];
const discounts: Discount[] = [];
const grants: Grant[] = [];
const invoices: Invoice[] = [];
const payments: Payment[] = [];
const unallocated: Unallocated[] = [1, 2, 3, 4].map((n) => ({
  id: `0190a6c2-0000-7000-8000-000000000f2${n}`,
  amountKobo: 250000,
  reference: `BANK-REF-${n}`,
  provider: "Transfer",
  gatewayTransactionId: null,
  receivedAt: "2026-11-02T09:00:00.000Z",
  isOpen: true,
  assignedStudentId: null,
}));
// One invoice for the ward, so a parent journey does not depend on a bursar's journey running first.
const seededInvoice: Invoice = {
  id: "0190a6c2-0000-7000-8000-000000000f30",
  invoiceNo: "INV-SEED",
  studentId: FEE_STUDENT,
  termId: TERM,
  status: "Issued",
  issuedAt: "2026-11-02T09:00:00.000Z",
  dueDate: "2026-12-15",
  subtotalKobo: 1500050,
  discountKobo: 0,
  adjustmentKobo: 0,
  totalKobo: 1500050,
  paidKobo: 0,
  balanceKobo: 1500050,
  voidReason: null,
  lines: [{ description: "Tuition", amountKobo: 1500050 }],
};
invoices.push(seededInvoice);
const idem = new Map<string, unknown>();
let invoiceSeq = 1000;
let receiptSeq = 1;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function paidFor(studentId: string): number {
  return sum(
    payments
      .filter((p) => p.studentId === studentId && p.status === "Succeeded")
      .map((p) => p.amountKobo),
  );
}

function refreshInvoice(inv: Invoice): Invoice {
  const paid = paidFor(inv.studentId);
  const total = inv.subtotalKobo - inv.discountKobo + inv.adjustmentKobo;
  return {
    ...inv,
    totalKobo: total,
    paidKobo: Math.min(paid, total),
    balanceKobo: Math.max(0, total - paid),
  };
}

/** Answers the fee operations. Returns false for paths it does not own. */
export function handleFees(call: FeesCall): boolean {
  const { method, path, url, body, res, send, label } = call;
  const key = call.idempotencyKey;
  const replay = (k: string | undefined, make: () => { status: number; body: unknown }) => {
    if (k !== undefined && idem.has(k)) return send(res, 200, idem.get(k));
    const out = make();
    if (k !== undefined) idem.set(k, out.body);
    send(res, out.status, out.body);
  };

  if (path === "/api/v1/fees/items" && method === "GET") return (send(res, 200, items), true);
  if (path === "/api/v1/fees/items" && method === "POST") {
    const item: Item = {
      id: randomUUID(),
      name: String(body["name"]),
      category: String(body["category"]),
      isMandatoryDefault: Boolean(body["isMandatoryDefault"]),
    };
    items.push(item);
    return (send(res, 201, item), true);
  }

  if (path === "/api/v1/fees/structures" && method === "GET")
    return (
      send(
        res,
        200,
        structures.map((x) => ({ ...x, totalKobo: sum(x.lines.map((l) => l.amountKobo)) })),
      ),
      true
    );
  if (path === "/api/v1/fees/structures" && method === "POST") {
    const lines = (
      body["lines"] as Array<{ feeItemId: string; amountKobo: number; isOptional: boolean }>
    ).map((l) => ({
      feeItemId: l.feeItemId,
      feeItemName: items.find((i) => i.id === l.feeItemId)?.name ?? "",
      amountKobo: l.amountKobo,
      isOptional: l.isOptional,
    }));
    const s: Structure = {
      id: randomUUID(),
      sessionId: String(body["sessionId"]),
      termId: (body["termId"] as string | null) ?? null,
      classLevelId: String(body["classLevelId"]),
      name: String(body["name"]),
      status: "Draft",
      lines,
    };
    structures.push(s);
    return (send(res, 201, { ...s, totalKobo: sum(lines.map((l) => l.amountKobo)) }), true);
  }
  const structure = /^\/api\/v1\/fees\/structures\/([^/]+)(\/lines|\/activate)?$/.exec(path);
  if (structure) {
    const s = structures.find((x) => x.id === structure[1]);
    if (!s) return (send(res, 404, problem(404, "fees.not_found", "Not found")), true);
    if (structure[2] === "/lines" && method === "PUT") {
      if (s.status !== "Draft")
        return (
          send(res, 409, problem(409, "fees.structure_not_draft", "Only a draft can change.")),
          true
        );
      const lines = body as unknown as Array<{
        feeItemId: string;
        amountKobo: number;
        isOptional: boolean;
      }>;
      s.lines = lines.map((l) => ({
        feeItemId: l.feeItemId,
        feeItemName: items.find((i) => i.id === l.feeItemId)?.name ?? "",
        amountKobo: l.amountKobo,
        isOptional: l.isOptional,
      }));
      return (send(res, 200, { ...s, totalKobo: sum(s.lines.map((l) => l.amountKobo)) }), true);
    }
    if (structure[2] === "/activate" && method === "POST") {
      s.status = "Active";
      return (send(res, 200, { ...s, totalKobo: sum(s.lines.map((l) => l.amountKobo)) }), true);
    }
    if (!structure[2] && method === "GET")
      return (send(res, 200, { ...s, totalKobo: sum(s.lines.map((l) => l.amountKobo)) }), true);
  }

  if (path === "/api/v1/fees/discounts" && method === "GET")
    return (send(res, 200, discounts), true);
  if (path === "/api/v1/fees/discounts" && method === "POST") {
    const d: Discount = {
      id: randomUUID(),
      name: String(body["name"]),
      kind: body["kind"] as Discount["kind"],
      value: Number(body["value"]),
      requiresApproval: Boolean(body["requiresApproval"]),
    };
    discounts.push(d);
    return (send(res, 201, d), true);
  }
  const grant = /^\/api\/v1\/students\/([^/]+)\/discounts$/.exec(path);
  if (grant && method === "POST") {
    const studentId = grant[1] ?? "";
    return (
      replay(key, () => {
        const d = discounts.find((x) => x.id === body["discountId"]);
        if (!d) return { status: 404, body: problem(404, "fees.discount_not_found", "Not found") };
        const g: Grant = {
          id: randomUUID(),
          studentId,
          discountId: d.id,
          termId: (body["termId"] as string | null) ?? null,
          status: d.requiresApproval ? "PendingApproval" : "Active",
          requestedBy: label,
          approvedBy: null,
        };
        grants.push(g);
        return { status: 201, body: g };
      }),
      true
    );
  }
  const approveGrant = /^\/api\/v1\/students\/([^/]+)\/discounts\/([^/]+)\/approve$/.exec(path);
  if (approveGrant && method === "POST") {
    const g = grants.find((x) => x.id === approveGrant[2]);
    if (!g) return (send(res, 404, problem(404, "fees.grant_not_found", "Not found")), true);
    if (g.requestedBy === label)
      return (
        send(
          res,
          422,
          problem(422, "fees.maker_checker", "A different person must approve this reversal."),
        ),
        true
      );
    g.approvedBy = label;
    g.status = "Active";
    return (send(res, 200, g), true);
  }

  if (path === "/api/v1/invoices/generate" && method === "POST") {
    return (
      replay(key, () => {
        const made: string[] = [];
        let existing = 0;
        for (const sid of [FEE_STUDENT]) {
          if (invoices.some((i) => i.studentId === sid && i.termId === body["termId"])) {
            existing += 1;
            continue;
          }
          const structureLines = structures.find((s) => s.status === "Active")?.lines ?? [];
          const subtotal = sum(structureLines.map((l) => l.amountKobo));
          const inv: Invoice = refreshInvoice({
            id: randomUUID(),
            invoiceNo: `INV-${invoiceSeq++}`,
            studentId: sid,
            termId: String(body["termId"]),
            status: "Issued",
            issuedAt: new Date().toISOString(),
            dueDate: "2026-12-15",
            subtotalKobo: subtotal,
            discountKobo: 0,
            adjustmentKobo: 0,
            totalKobo: subtotal,
            paidKobo: 0,
            balanceKobo: subtotal,
            voidReason: null,
            lines: structureLines.map((l) => ({
              description: l.feeItemName,
              amountKobo: l.amountKobo,
            })),
          });
          invoices.push(inv);
          made.push(inv.id);
        }
        return {
          status: 200,
          body: {
            created: made.length,
            skippedExisting: existing,
            skippedNoStructure: 0,
            skippedNoLines: 0,
            invoiceIds: made,
          },
        };
      }),
      true
    );
  }
  if (path === "/api/v1/invoices" && method === "GET") {
    const studentId = url.searchParams.get("studentId") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const termId = url.searchParams.get("termId") ?? "";
    const list = invoices
      .map(refreshInvoice)
      .filter((i) => studentId === "" || i.studentId === studentId)
      .filter((i) => status === "" || i.status === status)
      .filter((i) => termId === "" || i.termId === termId);
    send(res, 200, { items: list, page: 1, pageSize: 20, totalCount: list.length, totalPages: 1 });
    return true;
  }
  const invoice = /^\/api\/v1\/invoices\/([^/]+)(\/void|\/adjustments|\/pdf)?$/.exec(path);
  if (invoice) {
    const idx = invoices.findIndex((i) => i.id === invoice[1]);
    if (idx < 0) return (send(res, 404, problem(404, "fees.invoice_not_found", "Not found")), true);
    const inv = invoices[idx]!;
    if (!invoice[2] && method === "GET") return (send(res, 200, refreshInvoice(inv)), true);
    if (invoice[2] === "/pdf" && method === "GET") {
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${inv.invoiceNo}.pdf"`,
      });
      res.end("%PDF-1.4 fake invoice");
      return true;
    }
    if (invoice[2] === "/void" && method === "POST") {
      if (typeof body["reason"] !== "string" || body["reason"].trim() === "")
        return (send(res, 400, problem(400, "validation.failed", "Reason required")), true);
      invoices[idx] = { ...inv, status: "Void", voidReason: String(body["reason"]) };
      return (send(res, 200, refreshInvoice(invoices[idx]!)), true);
    }
    if (invoice[2] === "/adjustments" && method === "POST") {
      return (
        replay(key, () => {
          const amount = Number(body["amountKobo"]);
          const signed = body["kind"] === "Credit" ? -amount : amount;
          invoices[idx] = refreshInvoice({ ...inv, adjustmentKobo: inv.adjustmentKobo + signed });
          return { status: 200, body: refreshInvoice(invoices[idx]!) };
        }),
        true
      );
    }
  }

  if (path === "/api/v1/payments/manual" && method === "POST") {
    return (
      replay(key, () => {
        const p: Payment = {
          id: randomUUID(),
          receiptNo: `RCT-${String(receiptSeq++).padStart(5, "0")}`,
          studentId: String(body["studentId"]),
          amountKobo: Number(body["amountKobo"]),
          method: String(body["method"]),
          reference: String(body["reference"]),
          status: "Succeeded",
          paidAt: new Date().toISOString(),
          gatewayTransactionId: null,
          reversalRequested: false,
          reversalReason: null,
          reversedAt: null,
          requestedBy: null,
        };
        payments.push(p);
        return { status: 201, body: p };
      }),
      true
    );
  }
  if (path === "/api/v1/payments" && method === "GET") {
    const studentId = url.searchParams.get("studentId") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const list = payments.filter(
      (p) =>
        (studentId === "" || p.studentId === studentId) && (status === "" || p.status === status),
    );
    send(res, 200, { items: list, page: 1, pageSize: 20, totalCount: list.length, totalPages: 1 });
    return true;
  }
  if (path === "/api/v1/payments/unallocated" && method === "GET") {
    const list = unallocated.filter((u) => u.isOpen);
    send(res, 200, { items: list, page: 1, pageSize: 20, totalCount: list.length, totalPages: 1 });
    return true;
  }
  const assign = /^\/api\/v1\/payments\/unallocated\/([^/]+)\/assign$/.exec(path);
  if (assign && method === "POST") {
    return (
      replay(key, () => {
        const u = unallocated.find((x) => x.id === assign[1]);
        if (!u)
          return { status: 404, body: problem(404, "fees.unallocated_not_found", "Not found") };
        u.isOpen = false;
        u.assignedStudentId = String(body["studentId"]);
        payments.push({
          id: randomUUID(),
          receiptNo: `RCT-${String(receiptSeq++).padStart(5, "0")}`,
          studentId: u.assignedStudentId,
          amountKobo: u.amountKobo,
          method: "Transfer",
          reference: u.reference,
          status: "Succeeded",
          paidAt: new Date().toISOString(),
          gatewayTransactionId: null,
          reversalRequested: false,
          reversalReason: null,
          reversedAt: null,
          requestedBy: null,
        });
        return { status: 200, body: u };
      }),
      true
    );
  }
  const payment =
    /^\/api\/v1\/payments\/([^/]+)(\/receipt|\/reverse-request|\/reverse-approve)?$/.exec(path);
  if (payment && !["unallocated", "manual", "verify", "initialize"].includes(payment[1] ?? "")) {
    const idx = payments.findIndex((p) => p.id === payment[1]);
    // Not one of this double's payments: let the other handlers answer (the BFF download checks use a fixed id).
    if (idx < 0) return false;
    const p = payments[idx]!;
    if (!payment[2] && method === "GET") return (send(res, 200, p), true);
    if (payment[2] === "/receipt" && method === "GET") {
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${p.receiptNo ?? "receipt"}.pdf"`,
      });
      res.end("%PDF-1.4 fake receipt");
      return true;
    }
    if (payment[2] === "/reverse-request" && method === "POST") {
      if (p.status === "Reversed" || p.reversalRequested)
        return (
          send(res, 409, problem(409, "fees.reversal_state", "Already requested or reversed.")),
          true
        );
      payments[idx] = {
        ...p,
        reversalRequested: true,
        reversalReason: String(body["reason"]),
        requestedBy: label,
        status: "ReversalRequested",
      };
      return (send(res, 200, payments[idx]), true);
    }
    if (payment[2] === "/reverse-approve" && method === "POST") {
      if (!p.reversalRequested)
        return (
          send(res, 409, problem(409, "fees.no_request", "No reversal was requested.")),
          true
        );
      if (p.requestedBy === label)
        return (
          send(
            res,
            403,
            problem(422, "fees.maker_checker", "A different person must approve this reversal."),
          ),
          true
        );
      payments[idx] = {
        ...p,
        status: "Reversed",
        reversedAt: new Date().toISOString(),
        reversalRequested: false,
      };
      return (send(res, 200, payments[idx]), true);
    }
  }

  if (path === `/api/v1/students/${FEE_STUDENT}/ledger` && method === "GET") {
    const lines = [
      ...invoices
        .filter((i) => i.studentId === FEE_STUDENT)
        .map((i) => ({
          occurredAt: i.issuedAt,
          entryType: "Invoice",
          description: `Invoice ${i.invoiceNo}`,
          debitKobo: i.totalKobo,
          creditKobo: 0,
          balanceAfterKobo: 0,
        })),
      ...payments
        .filter((p) => p.studentId === FEE_STUDENT && p.status === "Succeeded")
        .map((p) => ({
          occurredAt: p.paidAt ?? "",
          entryType: "Payment",
          description: `Payment ${p.receiptNo ?? ""}`,
          debitKobo: 0,
          creditKobo: p.amountKobo,
          balanceAfterKobo: 0,
        })),
    ];
    let running = 0;
    const withBalance = lines.map((l) => {
      running += l.debitKobo - l.creditKobo;
      return { ...l, balanceAfterKobo: running };
    });
    send(res, 200, { studentId: FEE_STUDENT, balanceKobo: running, lines: withBalance });
    return true;
  }

  if (path === "/api/v1/fees/reports/collection" && method === "GET") {
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const within = payments.filter(
      (p) =>
        p.status === "Succeeded" &&
        (p.paidAt ?? "").slice(0, 10) >= from &&
        (p.paidAt ?? "").slice(0, 10) <= to,
    );
    const byMethod = [...new Set(within.map((p) => p.method))].map((m) => {
      const rows = within.filter((p) => p.method === m);
      return { method: m, amountKobo: sum(rows.map((r) => r.amountKobo)), count: rows.length };
    });
    const total = sum(within.map((p) => p.amountKobo));
    send(res, 200, {
      from,
      to,
      totalKobo: total,
      ledgerCreditsKobo: total,
      ledgerReversalsKobo: 0,
      byMethod,
    });
    return true;
  }
  if (path === "/api/v1/fees/reports/debtors" && method === "GET") {
    const owing = invoices
      .map(refreshInvoice)
      .filter((i) => i.status !== "Void" && i.balanceKobo > 0);
    send(res, 200, {
      totalOutstandingKobo: sum(owing.map((i) => i.balanceKobo)),
      buckets:
        owing.length === 0
          ? []
          : [
              {
                bucket: "0-30 days",
                invoices: owing.length,
                outstandingKobo: sum(owing.map((i) => i.balanceKobo)),
              },
            ],
      debtors: owing.map((i) => ({ studentId: i.studentId, outstandingKobo: i.balanceKobo })),
    });
    return true;
  }
  // Parent (ADR 0021): the ward, the ward's invoices, online payment, its verification.
  if (path === `/api/v1/me/wards/${FEE_STUDENT}` && method === "GET") {
    send(res, 200, {
      studentId: FEE_STUDENT,
      admissionNo: "GFA/0101",
      fullName: "Ada Okafor",
      status: "Active",
      currentClassArmId: null,
      relationship: "Mother",
    });
    return true;
  }
  if (path === "/api/v1/me/wards" && method === "GET") {
    send(res, 200, [
      {
        studentId: FEE_STUDENT,
        admissionNo: "GFA/0101",
        fullName: "Ada Okafor",
        status: "Active",
        currentClassArmId: null,
        relationship: "Mother",
      },
    ]);
    return true;
  }
  const wardInvoices = /^\/api\/v1\/me\/wards\/([^/]+)\/invoices$/.exec(path);
  if (wardInvoices && method === "GET") {
    const list = invoices.map(refreshInvoice).filter((i) => i.studentId === wardInvoices[1]);
    send(res, 200, { items: list, page: 1, pageSize: 20, totalCount: list.length, totalPages: 1 });
    return true;
  }
  if (path === "/api/v1/me/payments/initialize" && method === "POST") {
    return (
      replay(key, () => {
        const reference = `GW-${randomUUID().slice(0, 8)}`;
        const p: Payment = {
          id: randomUUID(),
          receiptNo: null,
          studentId: String(body["studentId"]),
          amountKobo: Number(body["amountKobo"]),
          method: "Card",
          reference,
          status: "Pending",
          paidAt: null,
          gatewayTransactionId: null,
          reversalRequested: false,
          reversalReason: null,
          reversedAt: null,
          requestedBy: null,
        };
        payments.push(p);
        return {
          status: 200,
          body: {
            paymentId: p.id,
            reference,
            authorizationUrl: `http://127.0.0.1:${Number(process.env.FAKE_API_PORT ?? 5999)}/__gateway?reference=${encodeURIComponent(reference)}`,
          },
        };
      }),
      true
    );
  }
  if (path === "/api/v1/payments/verify" && method === "GET") {
    const ref = url.searchParams.get("reference") ?? "";
    const p = payments.find((x) => x.reference === ref);
    if (!p) return (send(res, 404, problem(404, "fees.payment_not_found", "Not found")), true);
    send(res, 200, {
      ...p,
      receiptNo:
        p.status === "Succeeded"
          ? (p.receiptNo ?? `RCT-${String(receiptSeq++).padStart(5, "0")}`)
          : p.receiptNo,
    });
    return true;
  }

  if (path === "/api/v1/fees/reconciliation" && method === "GET") {
    send(res, 200, { students: 1, drift: [] });
    return true;
  }
  return false;
}

export const FEES_IDS = { SESSION, TERM, LEVEL, ITEM: items[0]!.id };

/** The gateway has taken the card payment: the payment is settled and the parent goes back to the school. */
export function settleGatewayPayment(reference: string): string {
  const p = payments.find((x) => x.reference === reference);
  if (p && p.status === "Pending") {
    p.status = "Succeeded";
    p.paidAt = new Date().toISOString();
    p.receiptNo = p.receiptNo ?? `RCT-${String(receiptSeq++).padStart(5, "0")}`;
  }
  return `${SCHOOL_ORIGIN}/wards/return?reference=${encodeURIComponent(reference)}`;
}
