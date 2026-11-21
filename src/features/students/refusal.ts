import { ApiError } from "@/lib/api/unwrap";

export function refusalText(
  err: unknown,
  tState: (k: string, v?: Record<string, string>) => string,
): string {
  const problem = err instanceof ApiError ? err.problem : null;
  if (problem?.status === 403) return tState("forbidden");
  return tState("refused", { code: problem?.code ?? "unknown" });
}
