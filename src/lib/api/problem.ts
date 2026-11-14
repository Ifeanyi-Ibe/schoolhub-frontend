// The single tolerant parser for API error bodies (RFC 9457 ProblemDetails).
//
// The contract's ProblemDetails schema omits `code`, `traceId` and `errors` (BACKEND_GAPS B-04).
// Those fields are optional here, and anything missing or malformed falls back to safe defaults,
// so the UI never crashes on an unexpected body.

import { z } from "zod";

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

const lenient = z.object({
  type: z.string().nullish(),
  title: z.string().nullish(),
  status: z.union([z.number(), z.string()]).nullish(),
  detail: z.string().nullish(),
  instance: z.string().nullish(),
  code: z.string().nullish(),
  traceId: z.string().nullish(),
  errors: z.record(z.string(), z.union([z.array(z.string()), z.string()])).nullish(),
});

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

/** Parse an error response. `status` comes from the HTTP response; the body may add detail. */
export function parseApiProblem(status: number, body: unknown): ApiProblem {
  const parsed = lenient.safeParse(body);
  const b = parsed.success ? parsed.data : undefined;
  const bodyStatus = b?.status === undefined || b?.status === null ? NaN : Number(b.status);
  const errors = b?.errors
    ? Object.fromEntries(
        Object.entries(b.errors).map(([field, messages]) => [
          field,
          Array.isArray(messages) ? messages : [messages],
        ]),
      )
    : null;
  return {
    status: Number.isFinite(bodyStatus) ? bodyStatus : status,
    type: b?.type ?? null,
    title: b?.title ?? GENERIC_TITLE[status] ?? "Something went wrong.",
    detail: b?.detail ?? null,
    instance: b?.instance ?? null,
    code: b?.code ?? null,
    traceId: b?.traceId ?? null,
    errors,
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
