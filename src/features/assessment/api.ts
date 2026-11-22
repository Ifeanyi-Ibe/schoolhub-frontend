// Assessment: score sheets (ADR 0022, slice 1). Typed by the generated client from docs/openapi/v1.json. Writes that the contract
// declares as idempotent carry an Idempotency-Key, one per user action, reused on retry (ADR 0022, decision 3).
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type ScoreSheetView = components["schemas"]["ScoreSheetView"];
export type ScoreRow = components["schemas"]["ScoreRow"];
export type ScoreCell = components["schemas"]["ScoreCell"];
export type RecordScoresOutcome = components["schemas"]["RecordScoresOutcome"];
export type AssessmentSchemeView = components["schemas"]["AssessmentSchemeView"];
export type ComponentView = components["schemas"]["ComponentView"];
export type TermView = components["schemas"]["TermView"];
export type MyAssignmentsView = components["schemas"]["MyAssignmentsView"];
export type SubjectView = components["schemas"]["SubjectView"];
export type LevelView = components["schemas"]["LevelView"];
export type ArmView = components["schemas"]["ArmView"];

export interface SheetKey {
  termId: string;
  classArmId: string;
  subjectId: string;
}

/** The default scheme's components, with their maximum and weight. The sheet carries only component ids. */
export function defaultSchemeQuery() {
  return {
    queryKey: ["assessment-schemes"] as const,
    queryFn: async () => {
      const schemes = unwrap(await apiClient.GET("/api/v1/assessment-schemes"));
      return schemes.find((s) => s.isDefault) ?? schemes[0] ?? null;
    },
  };
}

/** The terms of a session, in order. */
export function termsQuery(sessionId: string) {
  return {
    queryKey: ["assessment-terms", sessionId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/sessions/{id}/terms", { params: { path: { id: sessionId } } }),
      ),
  };
}

/** The signed-in user's assignments for the current session. A teacher enters scores for the ones with a subject. */
export function myAssignmentsOnlyQuery() {
  return {
    queryKey: ["my-assignments-assessment"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/me/assignments")),
  };
}

export function subjectsQuery() {
  return {
    queryKey: ["subjects"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/subjects")),
  };
}

/** Class arm names (level and arm), for the arms the user is assigned to. */
export function armNamesQuery() {
  return {
    queryKey: ["class-arm-names"] as const,
    queryFn: async () => {
      const levels = unwrap(await apiClient.GET("/api/v1/class-levels"));
      const arms = await Promise.all(
        levels.map(async (level) => ({
          level,
          arms: unwrap(
            await apiClient.GET("/api/v1/class-levels/{id}/arms", {
              params: { path: { id: level.id } },
            }),
          ),
        })),
      );
      const names = new Map<string, string>();
      for (const { level, arms: list } of arms) {
        for (const arm of list) names.set(arm.id, `${level.name} ${arm.name}`);
      }
      return names;
    },
  };
}

/**
 * The sheet for a term, arm and subject, or null when none has been opened yet. The contract answers 404 for a sheet that does
 * not exist, which is an ordinary answer here, not an error.
 */
export function sheetQuery(key: SheetKey) {
  return {
    queryKey: ["score-sheet", key.termId, key.classArmId, key.subjectId] as const,
    queryFn: async (): Promise<ScoreSheetView | null> => {
      const res = await apiClient.GET("/api/v1/assessment/score-sheets", {
        params: {
          query: { termId: key.termId, classArmId: key.classArmId, subjectId: key.subjectId },
        },
      });
      if (res.response.status === 404) return null;
      return unwrap(res);
    },
  };
}

/** Opens a sheet for a term, arm and subject. One key per user action. */
export async function openSheet(key: SheetKey, idempotencyKey: string): Promise<ScoreSheetView> {
  writePolicyHeaders({
    method: "POST",
    path: "/api/v1/assessment/score-sheets",
    idempotencyKey,
  });
  return unwrap(
    await apiClient.POST("/api/v1/assessment/score-sheets", {
      params: { header: { "Idempotency-Key": idempotencyKey } },
      body: key,
    }),
  );
}

/**
 * Saves the changed cells. The answer says how many were applied, ignored and rejected, and why. A cell saved from the
 * device's queue carries the time it was entered, and the server keeps the newer value (ADR 0023).
 */
export async function saveScores(
  sheetId: string,
  rows: Array<{
    studentId: string;
    componentId: string;
    score: string | null;
    absent: boolean;
    clientUpdatedAt?: string | null;
  }>,
  idempotencyKey: string,
): Promise<RecordScoresOutcome> {
  writePolicyHeaders({
    method: "PUT",
    path: `/api/v1/assessment/score-sheets/${sheetId}/scores`,
    idempotencyKey,
  });
  return unwrap(
    await apiClient.PUT("/api/v1/assessment/score-sheets/{id}/scores", {
      params: { path: { id: sheetId }, header: { "Idempotency-Key": idempotencyKey } },
      body: {
        rows: rows.map((r) => ({
          studentId: r.studentId,
          componentId: r.componentId,
          score: r.score,
          absent: r.absent,
          clientUpdatedAt: r.clientUpdatedAt ?? null,
        })),
      },
    }),
  );
}

export async function submitSheet(sheetId: string): Promise<ScoreSheetView> {
  return unwrap(
    await apiClient.POST("/api/v1/assessment/score-sheets/{id}/submit", {
      params: { path: { id: sheetId } },
    }),
  );
}

export async function approveSheet(sheetId: string): Promise<ScoreSheetView> {
  return unwrap(
    await apiClient.POST("/api/v1/assessment/score-sheets/{id}/approve", {
      params: { path: { id: sheetId } },
    }),
  );
}

export async function reopenSheet(sheetId: string, reason: string): Promise<ScoreSheetView> {
  return unwrap(
    await apiClient.POST("/api/v1/assessment/score-sheets/{id}/reopen", {
      params: { path: { id: sheetId } },
      body: { reason },
    }),
  );
}
