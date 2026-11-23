// Notification rules (ADR 0025, slice 3). The server decides what is sent and what may be retried; these checks stop an obvious
// mistake and decide which buttons appear, from the fields the server returns.

export const STATS_WINDOWS = [7, 30, 90] as const;

/** A template needs a body to be saved; the subject is optional. */
export function templateProblem(body: string): "bodyRequired" | null {
  return body.trim() === "" ? "bodyRequired" : null;
}

/** A failed message can be retried: it has an error on record and was never delivered (the server's fields, not its status word). */
export function canRetry(m: { lastError: string | null; deliveredAt: string | null }): boolean {
  return m.lastError !== null && m.deliveredAt === null;
}

/** A rate from the server, shown to one decimal place; the server may send no rate when nothing was sent. */
export function ratePercent(value: number | string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
}
