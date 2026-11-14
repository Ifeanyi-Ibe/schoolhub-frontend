// The single error boundary for API calls. Every openapi-fetch result passes through unwrap():
// success returns the data, anything else throws an ApiError carrying the tolerant ApiProblem.

import { parseApiProblem, type ApiProblem } from "./problem";

export class ApiError extends Error {
  readonly problem: ApiProblem;

  constructor(problem: ApiProblem) {
    super(problem.title);
    this.name = "ApiError";
    this.problem = problem;
  }
}

export interface ApiResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.response.ok) {
    throw new ApiError(parseApiProblem(result.response.status, result.error));
  }
  return result.data as T;
}
