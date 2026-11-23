// Results: computation (a job), the class broadsheet, a student's results, domains (traits and ratings) and remarks (ADR 0024).
// Typed by the generated client from docs/openapi/v1.json. The export and the report cards are files, fetched through the BFF.
import { apiClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import type { components } from "@/lib/api/schema";

export type JobView = components["schemas"]["JobView"];
export type StudentResultView = components["schemas"]["StudentResultView"];
export type SubjectResultView = components["schemas"]["SubjectResultView"];
export type TraitView = components["schemas"]["TraitView"];
export type RatingView = components["schemas"]["RatingView"];

export interface ClassKey {
  termId: string;
  classArmId: string;
}

/** Starts the computation of a class's results. The answer is a job; the screen polls it (ADR 0024, decision 2). */
export async function computeResults(key: ClassKey): Promise<JobView> {
  return unwrap(await apiClient.POST("/api/v1/assessment/compute", { body: key }));
}

export function jobQuery(id: string) {
  return {
    queryKey: ["assessment-job", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/assessment/jobs/{id}", { params: { path: { id } } })),
  };
}

/** The class broadsheet: each student's subjects, totals, grades and positions, as the server computed them. */
export function classResultsQuery(key: ClassKey) {
  return {
    queryKey: ["class-results", key.termId, key.classArmId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/assessment/results/class", {
          params: { query: { termId: key.termId, classArmId: key.classArmId } },
        }),
      ),
  };
}

/** The path the broadsheet export is downloaded from, through the BFF. */
export function classExportPath(key: ClassKey): string {
  const q = new URLSearchParams({ termId: key.termId, classArmId: key.classArmId });
  return `/api/v1/assessment/results/class/export?${q.toString()}`;
}

export function studentResultsQuery(studentId: string, termId: string) {
  return {
    queryKey: ["student-results", studentId, termId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/assessment/results/students/{id}", {
          params: { path: { id: studentId }, query: { termId } },
        }),
      ),
  };
}

/** The affective and psychomotor traits the school rates. */
export function traitsQuery() {
  return {
    queryKey: ["domain-traits"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/api/v1/domain-traits")),
  };
}

/** Saves a student's ratings for a term (1 to 5 each). The answer lists the ratings as the server holds them. */
export async function saveRatings(
  studentId: string,
  termId: string,
  ratings: Array<{ traitId: string; rating: number }>,
): Promise<RatingView[]> {
  return unwrap(
    await apiClient.PUT("/api/v1/assessment/ratings/students/{id}", {
      params: { path: { id: studentId }, query: { termId } },
      body: { ratings },
    }),
  );
}

/** Saves a remark: the teacher's (`results.scores.enter`) or the principal's (`results.approve`). Nothing is returned. */
export async function saveRemark(
  kind: "teacher" | "principal",
  studentId: string,
  termId: string,
  remark: string | null,
): Promise<void> {
  const params = { path: { id: studentId }, query: { termId } };
  const body = { remark };
  if (kind === "teacher") {
    unwrap(
      await apiClient.PUT("/api/v1/assessment/remarks/students/{id}/teacher", { params, body }),
    );
  } else {
    unwrap(
      await apiClient.PUT("/api/v1/assessment/remarks/students/{id}/principal", { params, body }),
    );
  }
}

export type CardView = components["schemas"]["CardView"];
export type GenerateCardsView = components["schemas"]["GenerateCardsView"];
export type PublishView = components["schemas"]["PublishView"];
export type GenerateCardsBody = components["schemas"]["GenerateCardsBody"];

/** Generates the report cards for a class. One key per user action, reused on retry (the contract declares it). */
export async function generateCards(
  body: GenerateCardsBody,
  idempotencyKey: string,
): Promise<GenerateCardsView> {
  writePolicyHeaders({ method: "POST", path: "/api/v1/report-cards/generate", idempotencyKey });
  return unwrap(
    await apiClient.POST("/api/v1/report-cards/generate", {
      params: { header: { "Idempotency-Key": idempotencyKey } },
      body,
    }),
  );
}

/** The cards of a class for a term. A withheld card is listed with `feesWithheld` true (ADR 0024, decision 4). */
export function cardsQuery(key: ClassKey) {
  return {
    queryKey: ["report-cards", key.termId, key.classArmId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/report-cards", {
          params: { query: { termId: key.termId, classArmId: key.classArmId } },
        }),
      ),
  };
}

/** Publishes the class's cards. Withheld cards stay hidden; the answer says how many were published and how many withheld. */
export async function publishCards(key: ClassKey): Promise<PublishView> {
  return unwrap(await apiClient.POST("/api/v1/report-cards/publish", { body: key }));
}

/** The path a report card PDF is downloaded from, through the BFF. The path holds the card's id, never a name. */
export function cardDownloadPath(cardId: string): string {
  return `/api/v1/report-cards/${encodeURIComponent(cardId)}/download`;
}
