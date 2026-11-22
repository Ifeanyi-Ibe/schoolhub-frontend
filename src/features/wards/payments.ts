// Online payment for a ward and its verification after the gateway returns the parent (ADR 0021). Kept apart from api.ts so that
// the wards list and the invoices do not load the idempotency helpers. Idempotency-Key is sent on the initialise call, which
// declares it.
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type InitializeView = components["schemas"]["InitializeView"];

/** Starts a card payment for a ward. The answer carries the gateway's authorisation URL. One key per attempt. */
export async function startOnlinePayment(
  body: { studentId: string; amountKobo: number; email: string },
  key: string,
): Promise<InitializeView> {
  writePolicyHeaders({
    method: "POST",
    path: "/api/v1/me/payments/initialize",
    idempotencyKey: key,
  });
  return unwrap(
    await apiClient.POST("/api/v1/me/payments/initialize", {
      params: { header: { "Idempotency-Key": key } },
      body,
    }),
  );
}

/** Asks the server what happened to a payment after the gateway returned the parent to the school. */
export function verifyPaymentQuery(reference: string) {
  return {
    queryKey: ["payment-verify", reference] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/payments/verify", { params: { query: { reference } } })),
  };
}
