import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/unwrap";
import { parseApiProblem } from "@/lib/api/problem";
import type { RecordScoresOutcome } from "../api";
import { scoresDb, wipeScoresStore, type ScoresDatabase, type QueuedScoreRow } from "./db";
import {
  discardScoreItem,
  enqueueScores,
  flushScoreQueue,
  resendRefusedScores,
  unsyncedScoreCount,
  type SendScores,
} from "./sync";

const KEY = { termId: "term-1", classArmId: "arm-1", subjectId: "sub-1" };
const SHEET = "sheet-1";
const AT = "2026-11-22T08:00:00.000Z";

const cell = (
  studentId: string,
  componentId = "c1",
  score: string | null = "10",
): QueuedScoreRow => ({
  studentId,
  componentId,
  score,
  absent: false,
  clientUpdatedAt: AT,
});

/** A server answer that settles each row the way the test asks. */
function answer(
  rows: Array<{ studentId: string; componentId: string; result: string; reason?: string | null }>,
): RecordScoresOutcome {
  return {
    sheetId: SHEET,
    status: "Draft",
    applied: rows.filter((r) => r.result.toLowerCase() === "applied").length,
    ignored: rows.filter((r) => r.result.toLowerCase().startsWith("ignored")).length,
    rejected: rows.filter((r) => !/^(applied|ignored)/i.test(r.result)).length,
    rows: rows.map((r) => ({
      studentId: r.studentId,
      componentId: r.componentId,
      result: r.result,
      reason: r.reason ?? null,
    })),
  };
}

let db: ScoresDatabase;

beforeEach(async () => {
  await wipeScoresStore();
  db = await scoresDb();
});

describe("a score saved on this device waits for the server", () => {
  it("is queued with its own key and no network", async () => {
    const item = await enqueueScores(db, KEY, SHEET, [cell("s1")]);
    expect(item.state).toBe("pending");
    expect(item.idempotencyKey).toMatch(/\S/);
    expect(await unsyncedScoreCount(db)).toBe(1);
  });

  it("is sent with its key, and removed once the server applies every cell", async () => {
    await enqueueScores(db, KEY, SHEET, [cell("s1"), cell("s2")]);
    const sent: Array<{ sheetId: string; key: string; rows: number }> = [];
    const send: SendScores = async (sheetId, rows, key) => {
      sent.push({ sheetId, key, rows: rows.length });
      return answer(rows.map((r) => ({ ...r, result: "applied" })));
    };
    const report = await flushScoreQueue(db, send);
    expect(report).toEqual({ applied: 2, ignored: 0, refused: 0, stopped: "none" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.sheetId).toBe(SHEET);
    expect(await unsyncedScoreCount(db)).toBe(0);
  });

  it("counts a cell the server already holds a newer value for as settled", async () => {
    await enqueueScores(db, KEY, SHEET, [cell("s1")]);
    const report = await flushScoreQueue(db, async (_s, rows) =>
      answer(rows.map((r) => ({ ...r, result: "IgnoredNewerExists" }))),
    );
    expect(report.ignored).toBe(1);
    expect(await unsyncedScoreCount(db)).toBe(0);
  });

  it("keeps a refused cell with the server's reason until the teacher resends or discards it", async () => {
    const item = await enqueueScores(db, KEY, SHEET, [cell("s1"), cell("s2")]);
    const report = await flushScoreQueue(db, async (_s, rows) =>
      answer(
        rows.map((r) =>
          r.studentId === "s2"
            ? { ...r, result: "rejected", reason: "above the maximum" }
            : { ...r, result: "applied" },
        ),
      ),
    );
    expect(report.refused).toBe(1);
    const kept = await db.queue.get(item.id ?? 0);
    expect(kept?.state).toBe("needsAttention");
    expect(kept?.refused).toEqual([
      { studentId: "s2", componentId: "c1", reason: "above the maximum" },
    ]);
    expect(kept?.rows.map((r) => r.studentId)).toEqual(["s2"]);
  });

  it("resends a refused cell under a new key, and discards are the only silent removal", async () => {
    const item = await enqueueScores(db, KEY, SHEET, [cell("s2")]);
    await flushScoreQueue(db, async (_s, rows) =>
      answer(rows.map((r) => ({ ...r, result: "rejected", reason: "not allowed" }))),
    );
    const before = await db.queue.get(item.id ?? 0);
    await resendRefusedScores(db, item.id ?? 0);
    const resent = await db.queue.get(item.id ?? 0);
    expect(resent?.state).toBe("pending");
    expect(resent?.idempotencyKey).not.toBe(before?.idempotencyKey);
    await discardScoreItem(db, item.id ?? 0);
    expect(await unsyncedScoreCount(db)).toBe(0);
  });

  it("stays pending when the connection fails, and is sent later", async () => {
    await enqueueScores(db, KEY, SHEET, [cell("s1")]);
    const offline = await flushScoreQueue(db, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(offline.stopped).toBe("offline");
    expect(await unsyncedScoreCount(db)).toBe(1);
    const later = await flushScoreQueue(db, async (_s, rows) =>
      answer(rows.map((r) => ({ ...r, result: "applied" }))),
    );
    expect(later.applied).toBe(1);
  });

  it("stops on a session end and keeps everything", async () => {
    await enqueueScores(db, KEY, SHEET, [cell("s1")]);
    const problem = parseApiProblem(401, { code: "auth.expired", title: "Unauthorized" });
    const report = await flushScoreQueue(db, async () => {
      throw new ApiError(problem);
    });
    expect(report.stopped).toBe("session");
    expect(await unsyncedScoreCount(db)).toBe(1);
  });

  it("keeps the whole save for the teacher when the server refuses it (for example, the sheet was submitted)", async () => {
    const item = await enqueueScores(db, KEY, SHEET, [cell("s1")]);
    const problem = parseApiProblem(422, {
      code: "assessment.not_draft",
      title: "The sheet is not a draft",
    });
    await flushScoreQueue(db, async () => {
      throw new ApiError(problem);
    });
    const kept = await db.queue.get(item.id ?? 0);
    expect(kept?.state).toBe("needsAttention");
    expect(kept?.refusedWhole).toBe("assessment.not_draft");
  });

  it("wipes the device's queue on sign-out", async () => {
    await enqueueScores(db, KEY, SHEET, [cell("s1")]);
    await wipeScoresStore();
    expect(await unsyncedScoreCount(db)).toBe(0);
  });
});
