// Attendance: the register, its submit and reopen, the absentees and summaries, and the term export. Typed by the
// generated client from docs/openapi/v1.json. The register write declares Idempotency-Key (sent per queued item);
// no attendance operation declares If-Match.
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type RegisterView = components["schemas"]["RegisterView"];
export type RegisterRow = components["schemas"]["RegisterRow"];
export type MarkRegisterRequest = components["schemas"]["MarkRegisterRequest"];
export type MarkOutcome = components["schemas"]["MarkOutcome"];
export type SubmitOutcome = components["schemas"]["SubmitOutcome"];
export type ReopenOutcome = components["schemas"]["ReopenOutcome"];
export type AbsenteeRow = components["schemas"]["AbsenteeRow"];

export function registerQuery(classArmId: string, date: string, period: string | null) {
  return {
    queryKey: ["attendance-register", classArmId, date, period ?? ""] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/attendance/class-arms/{id}", {
          params: {
            path: { id: classArmId },
            query: period === null ? { date } : { date, period },
          },
        }),
      ),
  };
}

/**
 * Saves a register (a bulk upsert). The key is the one the queue item was given when it was made, so a retry after a
 * dropped response is applied once (the contract declares Idempotency-Key on this operation).
 */
export async function saveRegister(
  classArmId: string,
  date: string,
  body: MarkRegisterRequest,
  idempotencyKey: string,
): Promise<MarkOutcome> {
  // The key is checked here (writePolicyHeaders refuses one the server would refuse) and sent as the declared header.
  writePolicyHeaders({
    method: "PUT",
    path: `/api/v1/attendance/class-arms/${classArmId}/${date}`,
    idempotencyKey,
  });
  return unwrap(
    await apiClient.PUT("/api/v1/attendance/class-arms/{id}/{date}", {
      params: { path: { id: classArmId, date }, header: { "Idempotency-Key": idempotencyKey } },
      body,
    }),
  );
}

export async function submitRegister(
  classArmId: string,
  date: string,
  period: string | null,
): Promise<SubmitOutcome> {
  return unwrap(
    await apiClient.POST("/api/v1/attendance/class-arms/{id}/{date}/submit", {
      params: {
        path: { id: classArmId, date },
        query: period === null ? {} : { period },
      },
    }),
  );
}

export async function reopenRegister(
  classArmId: string,
  date: string,
  period: string | null,
  reason: string,
): Promise<ReopenOutcome> {
  return unwrap(
    await apiClient.POST("/api/v1/attendance/class-arms/{id}/{date}/reopen", {
      params: { path: { id: classArmId, date } },
      body: { period, reason },
    }),
  );
}

export function absenteesQuery(classArmId: string, date: string, period: string | null) {
  return {
    queryKey: ["attendance-absentees", classArmId, date, period ?? ""] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/attendance/class-arms/{id}/absentees", {
          params: {
            path: { id: classArmId },
            query: period === null ? { date } : { date, period },
          },
        }),
      ),
  };
}

export function classSummaryQuery(classArmId: string, from: string, to: string) {
  return {
    queryKey: ["attendance-class-summary", classArmId, from, to] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/attendance/class-arms/{id}/class-summary", {
          params: { path: { id: classArmId }, query: { from, to } },
        }),
      ),
  };
}

export function termSummaryQuery(classArmId: string, termId: string) {
  return {
    queryKey: ["attendance-term-summary", classArmId, termId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/attendance/class-arms/{id}/term-summary", {
          params: { path: { id: classArmId }, query: { termId } },
        }),
      ),
  };
}

/** The API path of the term summary spreadsheet (XLSX), for the BFF download. Needs attendance.export. */
export function termSummaryXlsxPath(classArmId: string, termId: string): string {
  return `/api/v1/attendance/class-arms/${encodeURIComponent(classArmId)}/term-summary.xlsx?termId=${encodeURIComponent(termId)}`;
}
