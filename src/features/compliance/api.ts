// Compliance (ADR 0025, slice 5): consents, data requests with maker-checker, and the school's data export. Typed by the generated
// client from docs/openapi/v1.json. Create data request and start the export carry an Idempotency-Key (declared by the contract).
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type ConsentView = components["schemas"]["ConsentView"];
export type GrantConsentBody = components["schemas"]["GrantConsentBody"];
export type DataRequestView = components["schemas"]["DataRequestView"];
export type CreateDataRequestBody = components["schemas"]["CreateDataRequestBody"];
export type TenantExportView = components["schemas"]["TenantExportView"];

export const COMPLIANCE_PAGE_SIZE = 20;

export function consentsQuery(subjectType: string, subjectId: string, page: number) {
  return {
    queryKey: ["consents", subjectType, subjectId, page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/compliance/consents", {
          params: { query: { subjectType, subjectId, page, pageSize: COMPLIANCE_PAGE_SIZE } },
        }),
      ),
  };
}

export async function grantConsent(body: GrantConsentBody): Promise<ConsentView> {
  return unwrap(await apiClient.POST("/api/v1/compliance/consents", { body }));
}

export async function withdrawConsent(id: string): Promise<ConsentView> {
  return unwrap(
    await apiClient.POST("/api/v1/compliance/consents/{id}/withdraw", { params: { path: { id } } }),
  );
}

export function dataRequestsQuery(status: string, page: number) {
  return {
    queryKey: ["data-requests", status, page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/compliance/data-requests", {
          params: {
            query: { page, pageSize: COMPLIANCE_PAGE_SIZE, ...(status ? { status } : {}) },
          },
        }),
      ),
  };
}

export async function createDataRequest(
  body: CreateDataRequestBody,
  idempotencyKey: string,
): Promise<DataRequestView> {
  writePolicyHeaders({ method: "POST", path: "/api/v1/compliance/data-requests", idempotencyKey });
  return unwrap(
    await apiClient.POST("/api/v1/compliance/data-requests", {
      params: { header: { "Idempotency-Key": idempotencyKey } },
      body,
    }),
  );
}

export async function approveDataRequest(id: string): Promise<DataRequestView> {
  return unwrap(
    await apiClient.POST("/api/v1/compliance/data-requests/{id}/approve", {
      params: { path: { id } },
    }),
  );
}

export async function rejectDataRequest(id: string, note: string): Promise<DataRequestView> {
  return unwrap(
    await apiClient.POST("/api/v1/compliance/data-requests/{id}/reject", {
      params: { path: { id } },
      body: { note },
    }),
  );
}

/** The path a data subject's export is downloaded from, through the BFF. The path holds the request's id only. */
export function dataRequestExportPath(id: string): string {
  return `/api/v1/compliance/data-requests/${encodeURIComponent(id)}/export`;
}

export async function startTenantExport(idempotencyKey: string): Promise<TenantExportView> {
  writePolicyHeaders({ method: "POST", path: "/api/v1/compliance/tenant-export", idempotencyKey });
  return unwrap(
    await apiClient.POST("/api/v1/compliance/tenant-export", {
      params: { header: { "Idempotency-Key": idempotencyKey } },
    }),
  );
}

export async function tenantExportStatus(id: string): Promise<TenantExportView> {
  return unwrap(
    await apiClient.GET("/api/v1/compliance/tenant-export/{id}", { params: { path: { id } } }),
  );
}

/** The export's zip, through the BFF. The path holds the export's id only. */
export function tenantExportDownloadPath(id: string): string {
  return `/api/v1/compliance/tenant-export/${encodeURIComponent(id)}/download`;
}
