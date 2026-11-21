// Uploads a file the school stores (a student document, or an import file) through the BFF in three steps:
// presign (typed), send the bytes (the contract declares no body for this step, so the raw bytes go through the
// BFF proxy with the file's own content type; BACKEND_GAPS B-30), then complete (typed). The browser never
// talks to storage. The file is checked against the purpose's type and size before anything is sent.
import { apiClient } from "@/lib/api/client";
import { CSRF_HEADER_NAME } from "@/lib/api/csrf";
import { ApiError, unwrap } from "@/lib/api/unwrap";
import { parseApiProblem } from "@/lib/api/problem";
import type { components } from "@/lib/api/schema";
import { uploadProblem, type UploadPurpose } from "@/features/students/rules";

export type FileView = components["schemas"]["FileView"];

const CONTRACT_PURPOSE: Record<
  UploadPurpose,
  components["schemas"]["PresignUploadRequest"]["purpose"]
> = {
  document: "StudentDocument",
  import: "ImportUpload",
};

export class UploadRefused extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export async function uploadFile(file: File, purpose: UploadPurpose): Promise<FileView> {
  const problem = uploadProblem(file, purpose);
  if (problem !== null) throw new UploadRefused(problem);

  const presigned = unwrap(
    await apiClient.POST("/api/v1/files/presign-upload", {
      body: {
        purpose: CONTRACT_PURPOSE[purpose],
        contentType: file.type,
        sizeBytes: file.size,
        fileName: file.name,
      },
    }),
  );

  // uploadUrl is the API's own content path (for example /api/v1/files/{id}/content), so it goes through the BFF.
  const res = await fetch(`/api/bff${presigned.uploadUrl}`, {
    method: presigned.method,
    body: file,
    credentials: "same-origin",
    headers: { "Content-Type": file.type, [CSRF_HEADER_NAME]: "1" },
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new ApiError(parseApiProblem(res.status, body));
  }

  return unwrap(
    await apiClient.POST("/api/v1/files/{id}/complete", { params: { path: { id: presigned.id } } }),
  );
}
