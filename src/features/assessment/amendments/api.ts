// Amendments to a published result (ADR 0024, slice 5). The contract declares Idempotency-Key on the request; an approve or a
// reject is answered with the amendment as the server holds it. The contract has no list of amendments (B-47).
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type AmendmentView = components["schemas"]["AmendmentView"];
export type AmendmentBody = components["schemas"]["AmendmentBody"];

/** Asks for a change to a published score. One key per user action, reused on retry. */
export async function requestAmendment(
  body: AmendmentBody,
  idempotencyKey: string,
): Promise<AmendmentView> {
  writePolicyHeaders({ method: "POST", path: "/api/v1/assessment/amendments", idempotencyKey });
  return unwrap(
    await apiClient.POST("/api/v1/assessment/amendments", {
      params: { header: { "Idempotency-Key": idempotencyKey } },
      body,
    }),
  );
}

export async function approveAmendment(id: string): Promise<AmendmentView> {
  return unwrap(
    await apiClient.POST("/api/v1/assessment/amendments/{id}/approve", {
      params: { path: { id } },
    }),
  );
}

export async function rejectAmendment(id: string, reason: string): Promise<AmendmentView> {
  return unwrap(
    await apiClient.POST("/api/v1/assessment/amendments/{id}/reject", {
      params: { path: { id } },
      body: { reason },
    }),
  );
}
