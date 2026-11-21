// Academic sessions (school years), their terms, the school days in a term, and the rollover that starts a
// new session. Typed by the generated client from docs/openapi/v1.json (the spec since the B-19 renames).
// Rollover declares Idempotency-Key, so writePolicyHeaders sends one per user action; the other operations
// declare neither If-Match nor Idempotency-Key, so none is sent.
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type AcademicSession = components["schemas"]["AcademicsSessionView"];
export type SessionInput = components["schemas"]["SessionRequest"];
export type Term = components["schemas"]["TermView"];
export type TermInput = components["schemas"]["TermRequest"];
export type SchoolDays = components["schemas"]["SchoolDaysView"];

export const academicSessionsQuery = {
  queryKey: ["academic-sessions"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/sessions")),
};

export function sessionTermsQuery(sessionId: string) {
  return {
    queryKey: ["session-terms", sessionId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/sessions/{id}/terms", {
          params: { path: { id: sessionId } },
        }),
      ),
  };
}

export function termSchoolDaysQuery(termId: string) {
  return {
    queryKey: ["term-school-days", termId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/terms/{id}/school-days", {
          params: { path: { id: termId } },
        }),
      ),
  };
}

export async function createAcademicSession(input: SessionInput) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/sessions" });
  return unwrap(await apiClient.POST("/api/v1/sessions", { body: input, headers: policy.headers }));
}

export async function updateAcademicSession(id: string, input: SessionInput) {
  const policy = writePolicyHeaders({ method: "PUT", path: "/api/v1/sessions/{id}" });
  return unwrap(
    await apiClient.PUT("/api/v1/sessions/{id}", {
      params: { path: { id } },
      body: input,
      headers: policy.headers,
    }),
  );
}

export async function archiveAcademicSession(id: string) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/sessions/{id}/archive" });
  return unwrap(
    await apiClient.POST("/api/v1/sessions/{id}/archive", {
      params: { path: { id } },
      headers: policy.headers,
    }),
  );
}

export async function createTerm(sessionId: string, input: TermInput) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/sessions/{id}/terms" });
  return unwrap(
    await apiClient.POST("/api/v1/sessions/{id}/terms", {
      params: { path: { id: sessionId } },
      body: input,
      headers: policy.headers,
    }),
  );
}

export async function updateTerm(termId: string, input: TermInput) {
  const policy = writePolicyHeaders({ method: "PUT", path: "/api/v1/terms/{id}" });
  return unwrap(
    await apiClient.PUT("/api/v1/terms/{id}", {
      params: { path: { id: termId } },
      body: input,
      headers: policy.headers,
    }),
  );
}

export async function setCurrentTerm(termId: string) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/terms/{id}/set-current" });
  return unwrap(
    await apiClient.POST("/api/v1/terms/{id}/set-current", {
      params: { path: { id: termId } },
      headers: policy.headers,
    }),
  );
}

/**
 * Starts a new session from the current one. The contract declares Idempotency-Key for this operation: the
 * caller passes one key per user action (newActionKey) and reuses it on every retry. Shown as pending until
 * the backend answers; never optimistic.
 */
export async function rolloverToSession(input: SessionInput, actionKey: string) {
  const policy = writePolicyHeaders({
    method: "POST",
    path: "/api/v1/academics/rollover",
    idempotencyKey: actionKey,
  });
  const key = policy.headers["Idempotency-Key"];
  if (key === undefined) throw new RangeError("Rollover needs an Idempotency-Key for this action.");
  return unwrap(
    await apiClient.POST("/api/v1/academics/rollover", {
      body: input,
      params: { header: { "Idempotency-Key": key } },
    }),
  );
}
