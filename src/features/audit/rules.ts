// Audit rules (ADR 0025, slice 8). An export is finished when the server says Completed or Failed; the screen never assumes one.

export const OUTCOMES = ["Success", "Denied", "Failed"] as const;
export const EXPORT_TERMINAL = ["Completed", "Failed"] as const;

export function exportFinished(status: string): boolean {
  return (EXPORT_TERMINAL as readonly string[]).includes(status);
}

/** A date from a form, as a day, must be in order when both ends are given. */
export function rangeProblem(from: string, to: string): "reversed" | null {
  if (from !== "" && to !== "" && from > to) return "reversed";
  return null;
}
