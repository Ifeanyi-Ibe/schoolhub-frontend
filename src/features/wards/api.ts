// The parent's wards, and their invoices (ADR 0021). Typed by the generated client from docs/openapi/v1.json. Payment lives
// in payments.ts so that these reads do not load the payment code.
import { apiClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type WardView = components["schemas"]["WardView"];
export type FeesInvoiceView = components["schemas"]["FeesInvoiceView"];

export function wardsQuery() {
  return {
    queryKey: ["my-wards"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/me/wards")),
  };
}

export function wardQuery(id: string) {
  return {
    queryKey: ["my-ward", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/me/wards/{id}", { params: { path: { id } } })),
  };
}

export function wardInvoicesQuery(id: string, page: number) {
  return {
    queryKey: ["my-ward-invoices", id, page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/me/wards/{id}/invoices", {
          params: { path: { id }, query: { page, pageSize: 20 } },
        }),
      ),
  };
}
