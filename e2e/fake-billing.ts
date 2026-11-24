// Test double for the school's subscription, invoices and payment (ADR 0025, slice 6). Money is integer kobo. Paying an invoice
// marks it paid in memory; the answer is the server's. State resets with the run.
import type { ServerResponse } from "node:http";

type Send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => void;

export interface BillingCall {
  method: string;
  path: string;
  url: URL;
  body: Record<string, unknown>;
  res: ServerResponse;
  send: Send;
  label: string;
  idempotencyKey: string | undefined;
}

const problem = (status: number, code: string, title: string) => ({
  type: `urn:schoolhub:error:${code}`,
  title,
  status,
  detail: title,
  code,
});

interface Invoice {
  id: string;
  periodStart: string;
  dueOn: string;
  amountKobo: number;
  currency: string;
  status: string;
  paidAt: string | null;
  paymentReference: string | null;
}

const invoices: Invoice[] = [
  {
    id: "0190a6c2-0000-7000-8000-000000003001",
    periodStart: "2026-09-01",
    dueOn: "2026-09-10",
    amountKobo: 2500000,
    currency: "NGN",
    status: "Paid",
    paidAt: "2026-09-05T08:00:00.000Z",
    paymentReference: "SUB-0901",
  },
  {
    id: "0190a6c2-0000-7000-8000-000000003002",
    periodStart: "2026-10-01",
    dueOn: "2026-10-10",
    amountKobo: 2500000,
    currency: "NGN",
    status: "Issued",
    paidAt: null,
    paymentReference: null,
  },
  {
    id: "0190a6c2-0000-7000-8000-000000003003",
    periodStart: "2026-11-01",
    dueOn: "2026-11-10",
    amountKobo: 2500000,
    currency: "NGN",
    status: "Issued",
    paidAt: null,
    paymentReference: null,
  },
];

const CAN = new Set(["admin"]);

export function handleBilling(call: BillingCall): boolean {
  const { method, path, url, body, res, send, label } = call;
  if (!path.startsWith("/api/v1/billing/")) return false;
  if (!CAN.has(label)) return (send(res, 403, problem(403, "forbidden", "Forbidden")), true);

  if (path === "/api/v1/billing/subscription" && method === "GET") {
    const unpaid = invoices.filter((i) => i.paidAt === null);
    const outstanding = unpaid.reduce((n, i) => n + i.amountKobo, 0);
    send(res, 200, {
      status: "Active",
      planCode: "standard",
      planName: "Standard",
      planPriceKobo: 2500000,
      trialEndsAt: null,
      pastDueSince: null,
      suspendedForNonPayment: false,
      outstandingKobo: outstanding,
      oldestDueOn: unpaid[0]?.dueOn ?? null,
      graceEndsOn: null,
    });
    return true;
  }

  if (path === "/api/v1/billing/invoices" && method === "GET") {
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") ?? "20"));
    send(res, 200, {
      items: invoices.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      totalCount: invoices.length,
      totalPages: Math.max(1, Math.ceil(invoices.length / pageSize)),
    });
    return true;
  }

  if (path === "/api/v1/billing/pay" && method === "POST") {
    if (!call.idempotencyKey)
      return (
        send(res, 400, problem(400, "request.malformed", "Idempotency-Key is required")),
        true
      );
    const named = typeof body.invoiceId === "string" ? body.invoiceId : null;
    const inv = named
      ? invoices.find((i) => i.id === named)
      : invoices.find((i) => i.paidAt === null);
    if (!inv)
      return (send(res, 404, problem(404, "billing.invoice_not_found", "Invoice not found")), true);
    if (inv.paidAt !== null)
      return (
        send(res, 409, problem(409, "billing.already_paid", "The invoice is already paid")),
        true
      );
    inv.paidAt = new Date().toISOString();
    inv.status = "Paid";
    inv.paymentReference = `SUB-${inv.periodStart.replace(/-/g, "")}`;
    send(res, 200, {
      invoiceId: inv.id,
      invoiceStatus: inv.status,
      amountKobo: inv.amountKobo,
      reference: inv.paymentReference,
      tenantStatus: "Active",
    });
    return true;
  }

  return false;
}
