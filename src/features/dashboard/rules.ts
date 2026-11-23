// Dashboard rules (ADR 0025, slice 4). The server computes every figure; the screen only formats them and says what is missing.

/** A count as the server sends it (a number or a numeric string). Anything else shows as a dash, not as zero. */
export function countText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isSafeInteger(n) ? String(n) : "—";
}

/** A percentage from the server, to one decimal place. */
export function percentText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
}

/** The panels the server says it did not include: shown as the server names them. */
export function notIncludedList(items: readonly string[]): string[] {
  return items.filter((s) => s.trim() !== "");
}
