// Calls to the BFF auth routes (/api/bff/auth/*). Tokens never reach this code: responses carry a
// status only. Every mutating call sends the CSRF header.
import { CSRF_HEADER_NAME } from "@/lib/api/csrf";
import { parseRetryAfter } from "@/lib/api/unwrap";

export type AuthCall =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; code: string | null; retryAfter: number | null };

export async function postAuth(path: string, body: unknown): Promise<AuthCall> {
  let res: Response;
  try {
    res = await fetch(`/api/bff/auth/${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: "1" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    // Offline or unreachable: the same message as a server failure, so the user can retry.
    return { ok: false, status: 0, code: "network", retryAfter: null };
  }
  const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
  if (res.status === 204) return { ok: true, status: 204, body: {} };
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, status: res.status, body: data };
  const code = typeof data.code === "string" ? data.code : null;
  return { ok: false, status: res.status, code, retryAfter };
}
