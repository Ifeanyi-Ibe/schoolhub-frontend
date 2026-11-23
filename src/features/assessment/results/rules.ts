// Results rules (ADR 0024): ratings, job progress, and the remark text. The server decides what is allowed; these checks stop an
// obvious mistake before a request, and the screens show the server's answer.

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export type RatingProblem = "required" | "notWhole" | "range";

/** One rating entered as text: a whole number from 1 to 5. Blank is "not rated yet", which is not sent. */
export function ratingProblem(text: string): RatingProblem | null {
  const s = text.trim();
  if (s === "") return null;
  if (!/^\d+$/.test(s)) return "notWhole";
  const n = Number(s);
  if (n < RATING_MIN || n > RATING_MAX) return "range";
  return null;
}

/**
 * Whether a job has finished. The contract leaves `status` as a free string (B-46), so a job is finished when every item is
 * done, or when its status reads as completed or failed. Until then the screen keeps polling.
 */
export function jobFinished(job: {
  status: string;
  total: number | string;
  done: number | string;
  error?: string | null;
}): boolean {
  if (job.error) return true;
  const total = Number(job.total);
  const done = Number(job.done);
  if (total > 0 && done >= total) return true;
  const word = job.status.toLowerCase();
  return word.includes("complete") || word.includes("succeed") || word.includes("fail");
}

/** Progress as a share of the items, for a bar. A job with no items yet shows none. */
export function jobProgressPercent(job: { total: number | string; done: number | string }): number {
  const total = Number(job.total);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const pct = Math.round((Number(job.done) / total) * 100);
  return Math.min(100, Math.max(0, pct));
}

export const REMARK_MAX = 500;

/** A remark is free text. It is trimmed; a blank remark clears it, which the server records. */
export function remarkProblem(text: string): "tooLong" | null {
  return text.trim().length > REMARK_MAX ? "tooLong" : null;
}
