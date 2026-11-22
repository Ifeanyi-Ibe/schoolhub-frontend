// Fees and payments: fee items, structures, discounts, invoices, payments, receipts, reversals, unallocated payments, the
// per-student ledger and the reports. Typed by the generated client from docs/openapi/v1.json. Idempotency-Key is sent only
// on the operations the contract declares it on (ADR 0019).
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type FeeItemView = components["schemas"]["FeeItemView"];
export type FeeItemBody = components["schemas"]["FeeItemBody"];
export type StructureView = components["schemas"]["StructureView"];
export type StructureBody = components["schemas"]["StructureBody"];
export type StructureLineBody = components["schemas"]["StructureLineBody"];
export type DiscountView = components["schemas"]["DiscountView"];
export type DiscountBody = components["schemas"]["DiscountBody"];
export type StudentDiscountView = components["schemas"]["StudentDiscountView"];
export type FeesInvoiceView = components["schemas"]["FeesInvoiceView"];
export type GenerateView = components["schemas"]["GenerateView"];
export type FeesPaymentView = components["schemas"]["FeesPaymentView"];
export type UnallocatedView = components["schemas"]["UnallocatedView"];
export type LedgerView = components["schemas"]["LedgerView"];
export type CollectionView = components["schemas"]["CollectionView"];
export type DebtorsView = components["schemas"]["DebtorsView"];
export type AdjustmentBody = components["schemas"]["AdjustmentBody"];
export type ManualPaymentBody = components["schemas"]["ManualPaymentBody"];

/** A request the server refuses before it runs (a permission, a state or a rule). */
export type Idempotent = { idempotencyKey: string };

export function feeItemsQuery() {
  return {
    queryKey: ["fee-items"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/fees/items")),
  };
}

export async function createFeeItem(body: FeeItemBody) {
  return unwrap(await apiClient.POST("/api/v1/fees/items", { body }));
}

export function structuresQuery() {
  return {
    queryKey: ["fee-structures"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/fees/structures")),
  };
}

export function structureQuery(id: string) {
  return {
    queryKey: ["fee-structure", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/fees/structures/{id}", { params: { path: { id } } })),
  };
}

export async function createStructure(body: StructureBody) {
  return unwrap(await apiClient.POST("/api/v1/fees/structures", { body }));
}

/** Replaces a structure's lines. The lines can only change while the structure is a draft (the server enforces it). */
export async function saveStructureLines(id: string, lines: StructureLineBody[]) {
  return unwrap(
    await apiClient.PUT("/api/v1/fees/structures/{id}/lines", {
      params: { path: { id } },
      body: lines,
    }),
  );
}

export async function activateStructure(id: string) {
  return unwrap(
    await apiClient.POST("/api/v1/fees/structures/{id}/activate", { params: { path: { id } } }),
  );
}

export function discountsQuery() {
  return {
    queryKey: ["fee-discounts"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/fees/discounts")),
  };
}

export async function createDiscount(body: DiscountBody) {
  return unwrap(await apiClient.POST("/api/v1/fees/discounts", { body }));
}

/** Grants a discount to a student. Idempotent: one key per grant, reused on retry. */
export async function grantDiscount(
  studentId: string,
  discountId: string,
  termId: string | null,
  key: string,
) {
  writePolicyHeaders({
    method: "POST",
    path: `/api/v1/students/${studentId}/discounts`,
    idempotencyKey: key,
  });
  return unwrap(
    await apiClient.POST("/api/v1/students/{id}/discounts", {
      params: { path: { id: studentId }, header: { "Idempotency-Key": key } },
      body: { discountId, termId },
    }),
  );
}

export async function approveDiscount(studentId: string, assignmentId: string) {
  return unwrap(
    await apiClient.POST("/api/v1/students/{id}/discounts/{assignmentId}/approve", {
      params: { path: { id: studentId, assignmentId } },
    }),
  );
}

export interface InvoiceListParams {
  studentId: string;
  termId: string;
  status: string;
  page: number;
}

export function invoicesQuery(p: InvoiceListParams) {
  return {
    queryKey: ["fee-invoices", p.studentId, p.termId, p.status, p.page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/invoices", {
          params: {
            query: {
              ...(p.studentId !== "" ? { studentId: p.studentId } : {}),
              ...(p.termId !== "" ? { termId: p.termId } : {}),
              ...(p.status !== "" ? { status: p.status } : {}),
              page: p.page,
              pageSize: 20,
            },
          },
        }),
      ),
  };
}

export function invoiceQuery(id: string) {
  return {
    queryKey: ["fee-invoice", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/invoices/{id}", { params: { path: { id } } })),
  };
}

/** Generates invoices for a term and class (or level). Idempotent: one key per action; the answer counts what was made. */
export async function generateInvoices(
  body: { termId: string; classLevelId: string | null; classArmId: string | null },
  key: string,
): Promise<GenerateView> {
  writePolicyHeaders({ method: "POST", path: "/api/v1/invoices/generate", idempotencyKey: key });
  return unwrap(
    await apiClient.POST("/api/v1/invoices/generate", {
      params: { header: { "Idempotency-Key": key } },
      body,
    }),
  );
}

export async function voidInvoice(id: string, reason: string) {
  return unwrap(
    await apiClient.POST("/api/v1/invoices/{id}/void", {
      params: { path: { id } },
      body: { reason },
    }),
  );
}

export async function adjustInvoice(id: string, body: AdjustmentBody, key: string) {
  writePolicyHeaders({
    method: "POST",
    path: `/api/v1/invoices/${id}/adjustments`,
    idempotencyKey: key,
  });
  return unwrap(
    await apiClient.POST("/api/v1/invoices/{id}/adjustments", {
      params: { path: { id }, header: { "Idempotency-Key": key } },
      body,
    }),
  );
}

export interface PaymentListParams {
  studentId: string;
  status: string;
  page: number;
}

export function paymentsQuery(p: PaymentListParams) {
  return {
    queryKey: ["fee-payments", p.studentId, p.status, p.page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/payments", {
          params: {
            query: {
              ...(p.studentId !== "" ? { studentId: p.studentId } : {}),
              ...(p.status !== "" ? { status: p.status } : {}),
              page: p.page,
              pageSize: 20,
            },
          },
        }),
      ),
  };
}

export function paymentQuery(id: string) {
  return {
    queryKey: ["fee-payment", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/payments/{id}", { params: { path: { id } } })),
  };
}

/** Records a payment made at the school (cash, POS, cheque, transfer or card). Idempotent: one key per action. */
export async function recordManualPayment(
  body: {
    studentId: string;
    amountKobo: number;
    method: string;
    reference: string;
    paidOn: string | null;
  },
  key: string,
) {
  writePolicyHeaders({ method: "POST", path: "/api/v1/payments/manual", idempotencyKey: key });
  return unwrap(
    await apiClient.POST("/api/v1/payments/manual", {
      params: { header: { "Idempotency-Key": key } },
      body: body as ManualPaymentBody,
    }),
  );
}

export async function requestReversal(paymentId: string, reason: string) {
  return unwrap(
    await apiClient.POST("/api/v1/payments/{id}/reverse-request", {
      params: { path: { id: paymentId } },
      body: { reason },
    }),
  );
}

/** Approves a reversal someone else requested (maker-checker). The server refuses a self-approval. */
export async function approveReversal(paymentId: string) {
  return unwrap(
    await apiClient.POST("/api/v1/payments/{id}/reverse-approve", {
      params: { path: { id: paymentId } },
    }),
  );
}

export function unallocatedQuery(page: number) {
  return {
    queryKey: ["fee-unallocated", page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/payments/unallocated", {
          params: { query: { page, pageSize: 20 } },
        }),
      ),
  };
}

/** Assigns an unallocated payment to a student. Idempotent: one key per action. */
export async function assignUnallocated(id: string, studentId: string, key: string) {
  writePolicyHeaders({
    method: "POST",
    path: `/api/v1/payments/unallocated/${id}/assign`,
    idempotencyKey: key,
  });
  return unwrap(
    await apiClient.POST("/api/v1/payments/unallocated/{id}/assign", {
      params: { path: { id }, header: { "Idempotency-Key": key } },
      body: { studentId },
    }),
  );
}

export function studentLedgerQuery(studentId: string) {
  return {
    queryKey: ["fee-ledger", studentId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/students/{id}/ledger", {
          params: { path: { id: studentId } },
        }),
      ),
  };
}

export function collectionQuery(from: string, to: string) {
  return {
    queryKey: ["fee-collection", from, to] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/fees/reports/collection", { params: { query: { from, to } } }),
      ),
  };
}

export function debtorsQuery() {
  return {
    queryKey: ["fee-debtors"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/fees/reports/debtors")),
  };
}

export function reconciliationQuery() {
  return {
    queryKey: ["fee-reconciliation"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/fees/reconciliation")),
  };
}
