// Students: records, guardians, documents, notes, lifecycle, bulk import and promotions. Typed by the generated
// client from docs/openapi/v1.json. Reads need students.read (and the sub-permissions the spec names); writes
// need the permission the spec names. The spec declares Idempotency-Key on student registration, the import
// commit and promotions, and no If-Match on any student operation, so writePolicyHeaders sends exactly that.
import { apiClient } from "@/lib/api/client";
import { writePolicyHeaders } from "@/lib/api/idempotency";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

export type StudentListItem = components["schemas"]["StudentListItem"];
export type StudentView = components["schemas"]["StudentView"];
export type RegisterStudentRequest = components["schemas"]["RegisterStudentRequest"];
export type GuardianInput = components["schemas"]["GuardianInput"];
export type GuardianView = components["schemas"]["GuardianView"];
export type GuardianDetailView = components["schemas"]["GuardianDetailView"];
export type UpdateStudentRequest = components["schemas"]["UpdateStudentRequest"];
export type DocumentView = components["schemas"]["DocumentView"];
export type NoteView = components["schemas"]["NoteView"];
export type ImportJobView = components["schemas"]["ImportJobView"];
export type ImportRowView = components["schemas"]["ImportRowView"];
export type PromotionRequest = components["schemas"]["PromotionRequest"];
export type PromotionPreview = components["schemas"]["PromotionPreview"];
export type PromotionSummary = components["schemas"]["PromotionSummary"];
export type RegistrationView = components["schemas"]["RegistrationView"];

export interface StudentListParams {
  q: string;
  status: string;
  classArmId: string;
  page: number;
}

export function studentsQuery(params: StudentListParams) {
  return {
    queryKey: ["students", params.q, params.status, params.classArmId, params.page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/students", {
          params: {
            query: {
              ...(params.q !== "" ? { q: params.q } : {}),
              ...(params.status !== ""
                ? { status: params.status as StudentListItem["status"] }
                : {}),
              ...(params.classArmId !== "" ? { classArmId: params.classArmId } : {}),
              page: params.page,
              pageSize: 20,
            },
          },
        }),
      ),
  };
}

export function studentQuery(id: string) {
  return {
    queryKey: ["student", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/students/{id}", { params: { path: { id } } })),
  };
}

export function studentDocumentsQuery(id: string) {
  return {
    queryKey: ["student-documents", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/students/{id}/documents", { params: { path: { id } } })),
  };
}

export function studentNotesQuery(id: string) {
  return {
    queryKey: ["student-notes", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/students/{id}/notes", { params: { path: { id } } })),
  };
}

export function guardianQuery(id: string) {
  return {
    queryKey: ["guardian", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/guardians/{id}", { params: { path: { id } } })),
  };
}

export async function registerStudent(
  input: RegisterStudentRequest,
  actionKey: string,
  allowDuplicate: boolean,
) {
  const policy = writePolicyHeaders({
    method: "POST",
    path: "/api/v1/students",
    idempotencyKey: actionKey,
  });
  const key = policy.headers["Idempotency-Key"];
  if (key === undefined)
    throw new RangeError("Registration needs an Idempotency-Key for this action.");
  return unwrap(
    await apiClient.POST("/api/v1/students", {
      body: input,
      params: {
        header: { "Idempotency-Key": key },
        query: allowDuplicate ? { allowDuplicate: true } : {},
      },
    }),
  );
}

export async function updateStudent(id: string, input: UpdateStudentRequest) {
  return unwrap(
    await apiClient.PATCH("/api/v1/students/{id}", { params: { path: { id } }, body: input }),
  );
}

export async function deleteStudent(id: string) {
  return unwrap(await apiClient.DELETE("/api/v1/students/{id}", { params: { path: { id } } }));
}

export async function leaveStudent(
  id: string,
  status: "Withdrawn" | "Transferred",
  effectiveOn: string,
) {
  return unwrap(
    await apiClient.POST("/api/v1/students/{id}/withdraw", {
      params: { path: { id } },
      body: { status, effectiveOn },
    }),
  );
}

export async function graduateStudent(id: string, effectiveOn: string) {
  return unwrap(
    await apiClient.POST("/api/v1/students/{id}/graduate", {
      params: { path: { id } },
      body: { effectiveOn },
    }),
  );
}

export async function reinstateStudent(id: string, sessionId: string, classArmId: string) {
  return unwrap(
    await apiClient.POST("/api/v1/students/{id}/reinstate", {
      params: { path: { id } },
      body: { sessionId, classArmId },
    }),
  );
}

export async function transferStudentArm(id: string, classArmId: string) {
  return unwrap(
    await apiClient.POST("/api/v1/students/{id}/transfer-arm", {
      params: { path: { id } },
      body: { classArmId },
    }),
  );
}

export async function addGuardian(studentId: string, input: GuardianInput) {
  return unwrap(
    await apiClient.POST("/api/v1/students/{id}/guardians", {
      params: { path: { id: studentId } },
      body: input,
    }),
  );
}

export async function updateLink(
  studentId: string,
  guardianId: string,
  input: components["schemas"]["LinkUpdateRequest"],
) {
  return unwrap(
    await apiClient.PATCH("/api/v1/students/{id}/guardians/{guardianId}", {
      params: { path: { id: studentId, guardianId } },
      body: input,
    }),
  );
}

export async function removeGuardian(studentId: string, guardianId: string) {
  return unwrap(
    await apiClient.DELETE("/api/v1/students/{id}/guardians/{guardianId}", {
      params: { path: { id: studentId, guardianId } },
    }),
  );
}

export async function updateGuardianContact(
  guardianId: string,
  input: components["schemas"]["GuardianContactRequest"],
) {
  return unwrap(
    await apiClient.PATCH("/api/v1/guardians/{id}", {
      params: { path: { id: guardianId } },
      body: input,
    }),
  );
}

export async function inviteGuardian(guardianId: string) {
  return unwrap(
    await apiClient.POST("/api/v1/guardians/{id}/portal-invite", {
      params: { path: { id: guardianId } },
    }),
  );
}

export async function addDocument(
  studentId: string,
  input: { fileId: string; type: string; notes: string | null },
) {
  return unwrap(
    await apiClient.POST("/api/v1/students/{id}/documents", {
      params: { path: { id: studentId } },
      body: input,
    }),
  );
}

export async function removeDocument(studentId: string, documentId: string) {
  return unwrap(
    await apiClient.DELETE("/api/v1/students/{id}/documents/{documentId}", {
      params: { path: { id: studentId, documentId } },
    }),
  );
}

export async function addNote(
  studentId: string,
  category: "Pastoral" | "Disciplinary",
  text: string,
) {
  return unwrap(
    await apiClient.POST("/api/v1/students/{id}/notes", {
      params: { path: { id: studentId } },
      body: { category, text },
    }),
  );
}

/** Starts an import of a file the school uploaded (purpose ImportUpload). The job runs in the background. */
export async function createImportJob(fileId: string, sessionId: string) {
  return unwrap(await apiClient.POST("/api/v1/students/import", { body: { fileId, sessionId } }));
}

export function importJobQuery(id: string) {
  return {
    queryKey: ["import-job", id] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/api/v1/students/import/{id}", { params: { path: { id } } })),
  };
}

export function importRowsQuery(id: string, errorsOnly: boolean, page: number) {
  return {
    queryKey: ["import-rows", id, errorsOnly, page] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/api/v1/students/import/{id}/rows", {
          params: { path: { id }, query: { errorsOnly, page, pageSize: 20 } },
        }),
      ),
  };
}

/** Commits a validated import. The spec declares Idempotency-Key: one key per user action. */
export async function commitImport(
  id: string,
  mode: "SkipErrors" | "AllOrNothing",
  actionKey: string,
) {
  const policy = writePolicyHeaders({
    method: "POST",
    path: "/api/v1/students/import/{id}/commit",
    idempotencyKey: actionKey,
  });
  const key = policy.headers["Idempotency-Key"];
  if (key === undefined)
    throw new RangeError("Import commit needs an Idempotency-Key for this action.");
  return unwrap(
    await apiClient.POST("/api/v1/students/import/{id}/commit", {
      params: { path: { id }, header: { "Idempotency-Key": key } },
      body: { mode },
    }),
  );
}

export async function previewPromotion(input: PromotionRequest) {
  return unwrap(await apiClient.POST("/api/v1/promotions/preview", { body: input }));
}

/** Commits a promotion preview. Idempotency-Key is declared: one key per user action, reused on retry. */
export async function commitPromotion(input: PromotionRequest, actionKey: string) {
  const policy = writePolicyHeaders({
    method: "POST",
    path: "/api/v1/promotions/commit",
    idempotencyKey: actionKey,
  });
  const key = policy.headers["Idempotency-Key"];
  if (key === undefined)
    throw new RangeError("Promotion needs an Idempotency-Key for this action.");
  return unwrap(
    await apiClient.POST("/api/v1/promotions/commit", {
      body: input,
      params: { header: { "Idempotency-Key": key } },
    }),
  );
}
