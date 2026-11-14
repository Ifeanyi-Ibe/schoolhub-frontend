// The single tolerant parser for API error bodies (RFC 9457 ProblemDetails).
//
// Written without a schema library on purpose: this module is in the browser bundle, and the budget
// for the first load is tight. Every field is optional. Anything missing or malformed falls back
// to a safe default, so the UI never crashes on an unexpected body.

export interface ApiProblem {
  status: number;
  type: string | null;
  title: string;
  detail: string | null;
  instance: string | null;
  /** Stable machine code such as `students.duplicate_admission_no`, when the backend sends it. */
  code: string | null;
  traceId: string | null;
  /** Field errors: field name to messages. Null when the backend sends none. */
  errors: Record<string, string[]> | null;
}

const GENERIC_TITLE: Record<number, string> = {
  400: "Please check the highlighted fields.",
  401: "Your session has ended. Please sign in again.",
  402: "This school's account is suspended.",
  403: "You do not have permission to do that.",
  404: "We could not find that.",
  409: "This changed while you were working. Please check and try again.",
  422: "We could not complete that action.",
  429: "Too many requests. Please wait a moment.",
};

function text(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function fieldErrors(v: unknown): Record<string, string[]> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const out: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(v)) {
    if (typeof messages === "string") out[field] = [messages];
    else if (Array.isArray(messages))
      out[field] = messages.filter((m): m is string => typeof m === "string");
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Parse an error response. `status` is the HTTP status; the body may add detail but never changes it. */
export function parseApiProblem(status: number, body: unknown): ApiProblem {
  const b =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  return {
    status,
    type: text(b.type),
    title: text(b.title) ?? GENERIC_TITLE[status] ?? "Something went wrong.",
    detail: text(b.detail),
    instance: text(b.instance),
    code: text(b.code),
    traceId: text(b.traceId),
    errors: fieldErrors(b.errors),
  };
}

/** Text to copy into a support message. Never includes the request body or any token. */
export function problemDetailsForCopy(p: ApiProblem): string {
  return [
    `Status: ${p.status}`,
    p.code ? `Code: ${p.code}` : null,
    p.traceId ? `Trace: ${p.traceId}` : null,
    p.title,
  ]
    .filter(Boolean)
    .join("\n");
}
