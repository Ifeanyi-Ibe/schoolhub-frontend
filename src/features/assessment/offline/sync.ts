// Queue and sync for score entry (ADR 0023). A queued save is sent once per attempt with the key it was given, oldest first, one
// at a time. The server answers per row: applied and ignored rows are settled (ignored means the server already holds a newer
// value for that cell, which is last write wins); a refused row stays queued with its reason until the teacher resends or
// discards it. A failed connection or server leaves every item pending for the next attempt. Nothing is dropped silently.
import { ApiError } from "@/lib/api/unwrap";
import { withTimeout } from "@/lib/async/timeout";

/** A send that gets no answer in this time is treated as an unreachable connection (see lib/async/timeout). */
const SEND_LIMIT_MS = 15_000;
import { newActionKey } from "@/lib/api/idempotency";
import { saveScores, type RecordScoresOutcome } from "../api";
import { scoreRowKind, sheetKeyOf } from "../rules";
import type { SheetKey } from "../api";
import type { QueuedScoreRow, ScoreQueueItem, ScoresDatabase } from "./db";

export type SendScores = (
  sheetId: string,
  rows: QueuedScoreRow[],
  idempotencyKey: string,
) => Promise<RecordScoresOutcome>;

export interface ScoreFlushReport {
  applied: number;
  ignored: number;
  refused: number;
  /** Why the flush stopped early, if it did: the connection, the server, or the session. */
  stopped: "none" | "offline" | "server" | "session";
}

/** Queues cells the teacher entered on this device. No network is used. */
export async function enqueueScores(
  db: ScoresDatabase,
  key: SheetKey,
  sheetId: string,
  rows: QueuedScoreRow[],
  now: Date = new Date(),
): Promise<ScoreQueueItem> {
  const item: Omit<ScoreQueueItem, "id"> = {
    sheetKey: sheetKeyOf(key),
    sheetId,
    idempotencyKey: newActionKey(),
    createdAt: now.toISOString(),
    state: "pending",
    rows,
    refused: [],
    refusedWhole: null,
  };
  const id = await db.queue.add(item);
  return { ...item, id: Number(id) };
}

/** Items the device still owes the server: pending saves, and saves the teacher has to look at. */
export async function unsyncedScoreCount(db: ScoresDatabase): Promise<number> {
  return db.queue.count();
}

/** The teacher discards a refused save. This is the only way a queued item is removed without the server settling it. */
export async function discardScoreItem(db: ScoresDatabase, id: number): Promise<void> {
  await db.queue.delete(id);
}

/** The refused rows go back to pending with a new key: the resend is a new action, not a retry of the old one. */
export async function resendRefusedScores(db: ScoresDatabase, id: number): Promise<void> {
  const item = await db.queue.get(id);
  if (!item || item.state !== "needsAttention") return;
  const refusedCells = new Set(item.refused.map((r) => `${r.studentId}|${r.componentId}`));
  await db.queue.update(id, {
    state: "pending",
    rows: item.rows.filter((r) => refusedCells.has(`${r.studentId}|${r.componentId}`)),
    refused: [],
    refusedWhole: null,
    idempotencyKey: newActionKey(),
  });
}

let flushChain: Promise<void> = Promise.resolve();

/**
 * Sends every pending save, oldest first. One flush runs at a time: a second trigger (the connection returning while a save is
 * being sent) waits for the first, so the same item is never sent twice at once.
 */
export function flushScoreQueue(
  db: ScoresDatabase,
  send: SendScores = (sheetId, rows, key) =>
    withTimeout(
      saveScores(
        sheetId,
        rows.map((r) => ({
          studentId: r.studentId,
          componentId: r.componentId,
          score: r.score,
          absent: r.absent,
          clientUpdatedAt: r.clientUpdatedAt,
        })),
        key,
      ),
      SEND_LIMIT_MS,
    ),
): Promise<ScoreFlushReport> {
  const run = flushChain.then(() => flushOnce(db, send));
  flushChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function flushOnce(db: ScoresDatabase, send: SendScores): Promise<ScoreFlushReport> {
  const report: ScoreFlushReport = { applied: 0, ignored: 0, refused: 0, stopped: "none" };
  const pending = await db.queue.byState("pending");
  for (const item of pending) {
    let outcome: RecordScoresOutcome;
    try {
      outcome = await send(item.sheetId, item.rows, item.idempotencyKey);
    } catch (err) {
      const stop = stopFor(err);
      if (stop === "refused") {
        // The whole save was refused (for example, the sheet was submitted meanwhile): keep it, with the reason, for the teacher.
        const reason = reasonOf(err);
        await db.queue.update(item.id!, {
          state: "needsAttention",
          refusedWhole: reason,
          refused: item.rows.map((r) => ({
            studentId: r.studentId,
            componentId: r.componentId,
            reason,
          })),
        });
        report.refused += item.rows.length;
        continue;
      }
      report.stopped = stop;
      break;
    }

    const answered = new Map<string, { result: string; reason: string | null }>();
    for (const row of outcome.rows) {
      answered.set(`${row.studentId}|${row.componentId}`, {
        result: row.result,
        reason: row.reason ?? null,
      });
    }
    const refused: ScoreQueueItem["refused"] = [];
    const keep: QueuedScoreRow[] = [];
    for (const cell of item.rows) {
      const row = answered.get(`${cell.studentId}|${cell.componentId}`);
      if (!row) {
        refused.push({
          studentId: cell.studentId,
          componentId: cell.componentId,
          reason: "no_answer",
        });
        keep.push(cell);
        continue;
      }
      const kind = scoreRowKind(row.result);
      if (kind === "applied") report.applied += 1;
      else if (kind === "ignored") report.ignored += 1;
      else {
        refused.push({
          studentId: cell.studentId,
          componentId: cell.componentId,
          reason: row.reason ?? row.result,
        });
        keep.push(cell);
      }
    }
    if (refused.length === 0) {
      await db.queue.delete(item.id!);
    } else {
      report.refused += refused.length;
      await db.queue.update(item.id!, { state: "needsAttention", rows: keep, refused });
    }
  }
  return report;
}

type Stop = "offline" | "server" | "session" | "refused";

function stopFor(err: unknown): Stop {
  if (err instanceof ApiError) {
    const status = err.problem.status;
    if (status === 401) return "session";
    if (status >= 500) return "server";
    return "refused";
  }
  // A failed request never reached the server: the connection is the reason.
  return "offline";
}

function reasonOf(err: unknown): string {
  return err instanceof ApiError ? (err.problem.code ?? String(err.problem.status)) : "unknown";
}
