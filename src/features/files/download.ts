// Downloads a file the API serves (the import template, an error report, a receipt) through the BFF's download
// route, which streams it with the API's content type. The browser saves it under the given name.
import { CSRF_HEADER_NAME } from "@/lib/api/csrf";
import { ApiError } from "@/lib/api/unwrap";
import { parseApiProblem } from "@/lib/api/problem";

export async function downloadFromApi(path: string, fileName: string): Promise<void> {
  const res = await fetch("/api/bff/download", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: "1" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new ApiError(parseApiProblem(res.status, body));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downloads an API file whose address has a query (for example a term id on a report export). The BFF's download route
 * takes paths without queries, so this is a GET through the BFF proxy with the session, which streams the file as the
 * API sends it. The address carries ids only, never personal data.
 */
export async function downloadQueryFromApi(apiPath: string, fileName: string): Promise<void> {
  const res = await fetch(`/api/bff${apiPath}`, { method: "GET", credentials: "same-origin" });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new ApiError(parseApiProblem(res.status, body));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
