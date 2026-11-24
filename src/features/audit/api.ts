// The audit log and its export (ADR 0025, slice 8). Read only except the export, which creates an export record the server builds in
// the background. Typed by the generated client from docs/openapi/v1.json.
import { apiClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type AuditLogView = components["schemas"]["AuditLogView"];
export type AuditLogPage = components["schemas"]["AuditLogPage"];
export type AuditExportView = components["schemas"]["AuditExportView"];
export type AuditFilterInput = components["schemas"]["AuditFilterInput"];

export interface AuditFilters {
  action: string;
  entityType: string;
  outcome: string;
  from: string;
  to: string;
}

export function auditLogQuery(filters: AuditFilters, cursor: string | null) {
  return {
    queryKey: ["audit-log", filters, cursor] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/audit-logs", {
          params: {
            query: {
              pageSize: 50,
              ...(cursor ? { cursor } : {}),
              ...(filters.action ? { action: filters.action } : {}),
              ...(filters.entityType ? { entityType: filters.entityType } : {}),
              ...(filters.outcome ? { outcome: filters.outcome } : {}),
              ...(filters.from ? { from: filters.from } : {}),
              ...(filters.to ? { to: filters.to } : {}),
            },
          },
        }),
      ),
  };
}

/** Starts an export of the log for the filters. The answer is the export record, which the server builds in the background. */
export async function startAuditExport(filters: AuditFilters): Promise<AuditExportView> {
  const body: AuditFilterInput = {
    actorUserId: null,
    action: filters.action || null,
    entityType: filters.entityType || null,
    entityId: null,
    outcome: filters.outcome || null,
    correlationId: null,
    from: filters.from || null,
    to: filters.to || null,
  };
  return unwrap(await apiClient.POST("/api/v1/audit-logs/export", { body }));
}

export async function auditExportStatus(id: string): Promise<AuditExportView> {
  return unwrap(
    await apiClient.GET("/api/v1/audit-logs/exports/{id}", { params: { path: { id } } }),
  );
}

/** The export's CSV, through the BFF. The path holds the export's id only. */
export function auditExportDownloadPath(id: string): string {
  return `/api/v1/audit-logs/exports/${encodeURIComponent(id)}/download`;
}
