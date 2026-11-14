// ProblemDetails (RFC 9457) for responses the BFF generates itself. Upstream problem bodies are
// passed through unchanged. The client parses them with one tolerant parser (src/lib/api/problem.ts).

export interface BffProblem {
  type: "about:blank";
  title: string;
  status: number;
  code: string;
  detail: string;
}

export function problemResponse(
  status: number,
  code: string,
  title: string,
  detail: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const body: BffProblem = { type: "about:blank", title, status, code, detail };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/problem+json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
