// The school's subscription and invoices, and paying one (ADR 0025, slice 6). A money flow: integer kobo, one Idempotency-Key per
// payment action (the contract declares it), and nothing shown as paid until the server answers.
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type SubscriptionView = components["schemas"]["SubscriptionView"];
export type TenancyInvoiceView = components["schemas"]["TenancyInvoiceView"];
export type TenancyPaymentView = components["schemas"]["TenancyPaymentView"];

export const BILLING_PAGE_SIZE = 20;

export function subscriptionQuery() {
  return {
    queryKey: ["billing-subscription"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/billing/subscription")),
  };
}

export function billingInvoicesQuery(page: number) {
  return {
    queryKey: ["billing-invoices", page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/billing/invoices", {
          params: { query: { page, pageSize: BILLING_PAGE_SIZE } },
        }),
      ),
  };
}

/** Pays one invoice (or the oldest outstanding one when none is named). One key per attempt, reused on retry. */
export async function payInvoice(
  invoiceId: string | null,
  idempotencyKey: string,
): Promise<TenancyPaymentView> {
  writePolicyHeaders({ method: "POST", path: "/api/v1/billing/pay", idempotencyKey });
  return unwrap(
    await apiClient.POST("/api/v1/billing/pay", {
      params: { header: { "Idempotency-Key": idempotencyKey } },
      body: { invoiceId },
    }),
  );
}
