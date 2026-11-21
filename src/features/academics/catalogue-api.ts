// Subjects, class-level subject mappings, grading schemes and bands, assessment schemes and components,
// and the academic calendar. Typed by the generated client from docs/openapi/v1.json. Reads need
// academics.read, writes need academics.manage (the spec). None of these operations declares If-Match or
// Idempotency-Key, so writePolicyHeaders sends neither.
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type Subject = components["schemas"]["SubjectView"];
export type SubjectInput = components["schemas"]["SubjectRequest"];
export type MappingView = components["schemas"]["MappingView"];
export type GradingScheme = components["schemas"]["GradingSchemeView"];
export type BandInput = components["schemas"]["BandRequest"];
export type AssessmentScheme = components["schemas"]["AssessmentSchemeView"];
export type ComponentInput = components["schemas"]["ComponentRequest"];
export type CalendarDay = components["schemas"]["CalendarDayView"];
export type CalendarDayInput = components["schemas"]["CalendarDayRequest"];
export type SchoolDays = components["schemas"]["SchoolDaysView"];
export type ImportHolidaysResult = components["schemas"]["ImportHolidaysResult"];

// Queries ----------------------------------------------------------------------------------------

export const subjectsQuery = {
  queryKey: ["subjects"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/subjects")),
};

export function levelMappingsQuery(levelId: string) {
  return {
    queryKey: ["class-level-subjects", levelId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/class-levels/{id}/subjects", {
          params: { path: { id: levelId } },
        }),
      ),
  };
}

export const gradingSchemesQuery = {
  queryKey: ["grading-schemes"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/grading-schemes")),
};

export const assessmentSchemesQuery = {
  queryKey: ["assessment-schemes"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/assessment-schemes")),
};

export function calendarDaysQuery(from: string, to: string) {
  return {
    queryKey: ["calendar-days", from, to] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/calendar/days", {
          params: { query: { from, to } },
        }),
      ),
  };
}

export const sessionsForCalendarQuery = {
  queryKey: ["academic-sessions"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/api/v1/sessions")),
};

export function termsQuery(sessionId: string) {
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

export function schoolDaysQuery(termId: string) {
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

// Writes -----------------------------------------------------------------------------------------

export async function createSubject(input: SubjectInput) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/subjects" });
  return unwrap(await apiClient.POST("/api/v1/subjects", { body: input, headers: policy.headers }));
}

export async function updateSubject(id: string, input: SubjectInput) {
  const policy = writePolicyHeaders({ method: "PUT", path: "/api/v1/subjects/{id}" });
  return unwrap(
    await apiClient.PUT("/api/v1/subjects/{id}", {
      params: { path: { id } },
      body: input,
      headers: policy.headers,
    }),
  );
}

export async function deleteSubject(id: string) {
  const policy = writePolicyHeaders({ method: "DELETE", path: "/api/v1/subjects/{id}" });
  return unwrap(
    await apiClient.DELETE("/api/v1/subjects/{id}", {
      params: { path: { id } },
      headers: policy.headers,
    }),
  );
}

export async function saveLevelMappings(
  levelId: string,
  input: components["schemas"]["MappingRequest"][],
) {
  const policy = writePolicyHeaders({ method: "PUT", path: "/api/v1/class-levels/{id}/subjects" });
  return unwrap(
    await apiClient.PUT("/api/v1/class-levels/{id}/subjects", {
      params: { path: { id: levelId } },
      body: input,
      headers: policy.headers,
    }),
  );
}

export async function createGradingScheme(name: string) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/grading-schemes" });
  return unwrap(
    await apiClient.POST("/api/v1/grading-schemes", { body: { name }, headers: policy.headers }),
  );
}

export async function saveBands(schemeId: string, bands: BandInput[]) {
  const policy = writePolicyHeaders({ method: "PUT", path: "/api/v1/grading-schemes/{id}/bands" });
  return unwrap(
    await apiClient.PUT("/api/v1/grading-schemes/{id}/bands", {
      params: { path: { id: schemeId } },
      body: bands,
      headers: policy.headers,
    }),
  );
}

export async function setDefaultGrading(schemeId: string) {
  const policy = writePolicyHeaders({
    method: "POST",
    path: "/api/v1/grading-schemes/{id}/set-default",
  });
  return unwrap(
    await apiClient.POST("/api/v1/grading-schemes/{id}/set-default", {
      params: { path: { id: schemeId } },
      headers: policy.headers,
    }),
  );
}

export async function deleteGradingScheme(schemeId: string) {
  const policy = writePolicyHeaders({ method: "DELETE", path: "/api/v1/grading-schemes/{id}" });
  return unwrap(
    await apiClient.DELETE("/api/v1/grading-schemes/{id}", {
      params: { path: { id: schemeId } },
      headers: policy.headers,
    }),
  );
}

export async function createAssessmentScheme(name: string) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/assessment-schemes" });
  return unwrap(
    await apiClient.POST("/api/v1/assessment-schemes", { body: { name }, headers: policy.headers }),
  );
}

export async function saveComponents(schemeId: string, components: ComponentInput[]) {
  const policy = writePolicyHeaders({
    method: "PUT",
    path: "/api/v1/assessment-schemes/{id}/components",
  });
  return unwrap(
    await apiClient.PUT("/api/v1/assessment-schemes/{id}/components", {
      params: { path: { id: schemeId } },
      body: components,
      headers: policy.headers,
    }),
  );
}

export async function setDefaultAssessment(schemeId: string) {
  const policy = writePolicyHeaders({
    method: "POST",
    path: "/api/v1/assessment-schemes/{id}/set-default",
  });
  return unwrap(
    await apiClient.POST("/api/v1/assessment-schemes/{id}/set-default", {
      params: { path: { id: schemeId } },
      headers: policy.headers,
    }),
  );
}

export async function createCalendarDay(input: CalendarDayInput) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/calendar/days" });
  return unwrap(
    await apiClient.POST("/api/v1/calendar/days", { body: input, headers: policy.headers }),
  );
}

export async function deleteCalendarDay(id: string) {
  const policy = writePolicyHeaders({ method: "DELETE", path: "/api/v1/calendar/days/{id}" });
  return unwrap(
    await apiClient.DELETE("/api/v1/calendar/days/{id}", {
      params: { path: { id } },
      headers: policy.headers,
    }),
  );
}

export async function importHolidays(year: number) {
  const policy = writePolicyHeaders({ method: "POST", path: "/api/v1/calendar/import-holidays" });
  return unwrap(
    await apiClient.POST("/api/v1/calendar/import-holidays", {
      body: { year },
      headers: policy.headers,
    }),
  );
}
