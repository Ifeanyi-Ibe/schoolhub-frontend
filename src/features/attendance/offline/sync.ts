// Queue and sync (ADR 0017). A queued save is sent once per attempt with the key it was given, in order, one at a time.
// The server answers per row: applied and ignored rows are settled; a refused row stays queued with its reason until the
// teacher resends or discards it. A network or server failure leaves every item pending for the next attempt. Nothing
// is dropped silently.
import { ApiError } from "@/lib/api/unwrap";
import { withTimeout } from "@/lib/async/timeout";

/** A send that gets no answer in this time is treated as an unreachable connection (see lib/async/timeout). */
const SEND_LIMIT_MS = 15_000;
import { newActionKey } from "@/lib/api/idempotency";
import { saveRegister, type MarkOutcome, type MarkRegisterRequest } from "../api";
import { registerKey, rowResult, type QueuedMark, type RegisterKey } from "../rules";
import type { AttendanceDatabase, QueueItem } from "./db";

export type SendRegister = (
  classArmId: string,
  date: string,
  body: MarkRegisterRequest,
  idempotencyKey: string,
) => Promise<MarkOutcome>;

export interface FlushReport {
  applied: number;
  ignored: number;
  refused: number;
  /** Why the flush stopped early, if it did: the connection, the server, or the session. */
  stopped: "none" | "offline" | "server" | "session";
}

/** Queues a save for this register. The item gets its own key, reused on every retry. */
export async function enqueueMarks(
  db: AttendanceDatabase,
  key: RegisterKey,
  marks: QueuedMark[],
  now: Date = new Date(),
): Promise<QueueItem> {
  const item: Omit<QueueItem, "id"> = {
    registerKey: registerKey(key),
    classArmId: key.classArmId,
    date: key.date,
    period: key.period,
    idempotencyKey: newActionKey(),
    createdAt: now.toISOString(),
    state: "pending",
    marks,
    refused: [],
    refusedWhole: null,
  };
  const id = await db.queue.add(item);
  return { ...item, id: Number(id) };
}

/** Items the device still owes the server: pending saves, and saves the teacher has to look at. */
export async function unsyncedCount(db: AttendanceDatabase): Promise<number> {
  return db.queue.count();
}

/** The teacher discards a refused save. This is the only way a queued item is removed without the server settling it. */
export async function discardItem(db: AttendanceDatabase, id: number): Promise<void> {
  await db.queue.delete(id);
}

/** The refused rows go back to pending with a new key: the resend is a new action, not a retry of the old one. */
export async function resendRefused(db: AttendanceDatabase, id: number): Promise<void> {
  const item = await db.queue.get(id);
  if (!item || item.state !== "needsAttention") return;
  const refusedIds = new Set(item.refused.map((r) => r.studentId));
  await db.queue.update(id, {
    state: "pending",
    marks: item.marks.filter((m) => refusedIds.has(m.studentId)),
    refused: [],
    refusedWhole: null,
    idempotencyKey: newActionKey(),
  });
}

/** Sends every pending save, oldest first. Stops at the first connection, server or session failure. */
/**
 * Sends every pending save, oldest first. One flush runs at a time: a second trigger (the connection returning while a
 * save is being sent) waits for the first, so the same item is never sent twice at once.
 */
export function flushQueue(
  db: AttendanceDatabase,
  send: SendRegister = (...args) => withTimeout(saveRegister(...args), SEND_LIMIT_MS),
): Promise<FlushReport> {
  const run = flushChain.then(() => flushOnce(db, send));
  flushChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

let flushChain: Promise<void> = Promise.resolve();

async function flushOnce(db: AttendanceDatabase, send: SendRegister): Promise<FlushReport> {
  const report: FlushReport = { applied: 0, ignored: 0, refused: 0, stopped: "none" };
  const pending = await db.queue.byState("pending");
  for (const item of pending) {
    let outcome: MarkOutcome;
    try {
      outcome = await send(
        item.classArmId,
        item.date,
        {
          period: item.period,
          reason: null,
          entries: item.marks.map((m) => ({
            studentId: m.studentId,
            status: m.status,
            arrivalTime: m.arrivalTime,
            note: null,
            clientId: m.clientId,
            clientUpdatedAt: m.clientUpdatedAt,
          })),
        },
        item.idempotencyKey,
      );
    } catch (err) {
      const stop = stopFor(err);
      if (stop === "refused") {
        // The whole save was refused (for example a locked register): keep it, with the reason, for the teacher.
        await db.queue.update(item.id!, {
          state: "needsAttention",
          refusedWhole: reasonOf(err),
          refused: item.marks.map((m) => ({ studentId: m.studentId, reason: reasonOf(err) })),
        });
        report.refused += item.marks.length;
        continue;
      }
      report.stopped = stop;
      break;
    }

    const answered = new Map<string, { result: string; reason: string | null }>();
    for (const row of outcome.rows) {
      answered.set(row.clientId ?? row.studentId, {
        result: row.result,
        reason: row.reason ?? null,
      });
    }
    const refused: QueueItem["refused"] = [];
    const keep: QueuedMark[] = [];
    for (const mark of item.marks) {
      const row = answered.get(mark.clientId) ?? answered.get(mark.studentId);
      if (!row) {
        refused.push({ studentId: mark.studentId, reason: "no_answer" });
        keep.push(mark);
        continue;
      }
      const kind = rowResult(row.result);
      if (kind === "applied") report.applied += 1;
      else if (kind === "ignored") report.ignored += 1;
      else {
        refused.push({ studentId: mark.studentId, reason: row.reason ?? row.result });
        keep.push(mark);
      }
    }
    if (refused.length === 0) {
      await db.queue.delete(item.id!);
    } else {
      report.refused += refused.length;
      await db.queue.update(item.id!, { state: "needsAttention", marks: keep, refused });
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
