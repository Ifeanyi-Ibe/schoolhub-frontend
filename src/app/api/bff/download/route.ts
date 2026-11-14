// Streams a file (PDF, XLSX, CSV) through the BFF. POST so the request is covered by the CSRF guard.
import { handleDownload, parseDownloadRequest } from "@/server/bff-proxy";
import { createBffDeps } from "@/server/deps";
import { problemResponse } from "@/server/problem";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return problemResponse(
      400,
      "bff.download_invalid",
      "Invalid download",
      "Request body must be JSON.",
    );
  }
  const parsed = parseDownloadRequest(raw);
  if (parsed === null) {
    return problemResponse(
      400,
      "bff.download_invalid",
      "Invalid download",
      "Provide exactly one of path or url.",
    );
  }
  return handleDownload(request, parsed, createBffDeps());
}
