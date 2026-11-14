// The single error boundary for API calls. Every openapi-fetch result passes through unwrap():
// success returns the data, anything else throws an ApiError carrying the tolerant ApiProblem.

import { markBillingSuspended } from "./billing-events";
import { parseApiProblem, type ApiProblem } from "./problem";

export class ApiError extends Error {
  readonly problem: ApiProblem;
  /** Seconds from the Retry-After header, when the server sent one (429, 409, 503). */
  readonly retryAfterSeconds: number | null;

  constructor(problem: ApiProblem, retryAfterSeconds: number | null = null) {
    super(problem.title);
    this.name = "ApiError";
    this.problem = problem;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Parse a Retry-After delta-seconds header. Null when absent or not a number. */
export function parseRetryAfter(header: string | null): number | null {
  if (header === null) return null;
  const n = Number(header.trim());
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export interface ApiResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.response.ok) {
    // A suspended school is read-only everywhere: record it at the single error boundary.
    if (result.response.status === 402) markBillingSuspended();
    throw new ApiError(
      parseApiProblem(result.response.status, result.error),
      parseRetryAfter(result.response.headers.get("retry-after")),
    );
  }
  return result.data as T;
}
