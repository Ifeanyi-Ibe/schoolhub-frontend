import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/unwrap";
import { parseApiProblem } from "@/lib/api/problem";
import type { MarkOutcome } from "../api";
import { attendanceDb, wipeAttendanceStore, type AttendanceDatabase } from "./db";
import {
  discardItem,
  enqueueMarks,
  flushQueue,
  resendRefused,
  unsyncedCount,
  type SendRegister,
} from "./sync";
import type { QueuedMark } from "../rules";

const KEY = { classArmId: "arm-1", date: "2026-11-02", period: null };
let n = 0;
const mark = (studentId: string, status: QueuedMark["status"] = "Present"): QueuedMark => ({
  studentId,
  status,
  arrivalTime: null,
  clientId: `c-${studentId}-${++n}`,
  clientUpdatedAt: "2026-11-02T08:00:00.000Z",
});

/** A server answer that settles every row the way the test asks. */
function answer(
  rows: Array<{ clientId: string; studentId: string; result: string; reason?: string | null }>,
): MarkOutcome {
  return {
    sessionId: "s",
    date: KEY.date,
    period: null,
    sessionStatus: "Open",
    applied: rows.filter((r) => r.result === "applied").length,
    ignored: rows.filter((r) => r.result === "ignored_newer_exists").length,
    rejected: rows.filter((r) => r.result !== "applied" && r.result !== "ignored_newer_exists")
      .length,
    rows: rows.map((r) => ({
      studentId: r.studentId,
      clientId: r.clientId,
      result: r.result,
      reason: r.reason ?? null,
    })),
  } as MarkOutcome;
}

let db: AttendanceDatabase;

beforeEach(async () => {
  db = await attendanceDb();
  await wipeAttendanceStore();
});

describe("the offline queue", () => {
  it("settles applied rows and removes the item", async () => {
    const marks = [mark("s1"), mark("s2", "Absent")];
    await enqueueMarks(db, KEY, marks);
    const send: SendRegister = async () =>
      answer(
        marks.map((m) => ({ clientId: m.clientId, studentId: m.studentId, result: "applied" })),
      );
    const report = await flushQueue(db, send);
    expect(report).toEqual({ applied: 2, ignored: 0, refused: 0, stopped: "none" });
    expect(await unsyncedCount(db)).toBe(0);
  });

  it("counts a row the server ignored because a newer mark exists, and settles it", async () => {
    const marks = [mark("s1")];
    await enqueueMarks(db, KEY, marks);
    const report = await flushQueue(db, async () =>
      answer([{ clientId: marks[0]!.clientId, studentId: "s1", result: "ignored_newer_exists" }]),
    );
    expect(report.ignored).toBe(1);
    expect(await unsyncedCount(db)).toBe(0);
  });

  it("keeps a refused row for the teacher, with the server's reason, and does not resend it by itself", async () => {
    const marks = [mark("s1"), mark("s2")];
    await enqueueMarks(db, KEY, marks);
    const report = await flushQueue(db, async () =>
      answer([
        { clientId: marks[0]!.clientId, studentId: "s1", result: "applied" },
        {
          clientId: marks[1]!.clientId,
          studentId: "s2",
          result: "rejected",
          reason: "Not a student in this class.",
        },
      ]),
    );
    expect(report.refused).toBe(1);
    const [item] = await db.queue.all();
    expect(item!.state).toBe("needsAttention");
    expect(item!.refused).toEqual([{ studentId: "s2", reason: "Not a student in this class." }]);
    expect(item!.marks.map((m) => m.studentId)).toEqual(["s2"]);

    let sent = 0;
    await flushQueue(db, async () => {
      sent += 1;
      return answer([]);
    });
    expect(sent).toBe(0);
  });

  it("resends a refused row only when the teacher asks, with a new key", async () => {
    const marks = [mark("s2")];
    await enqueueMarks(db, KEY, marks);
    await flushQueue(db, async () =>
      answer([{ clientId: marks[0]!.clientId, studentId: "s2", result: "rejected", reason: "x" }]),
    );
    const [before] = await db.queue.all();
    await resendRefused(db, before!.id!);
    const [after] = await db.queue.all();
    expect(after!.state).toBe("pending");
    expect(after!.idempotencyKey).not.toBe(before!.idempotencyKey);
  });

  it("discards a refused item only when the teacher discards it", async () => {
    await enqueueMarks(db, KEY, [mark("s1")]);
    await flushQueue(db, async () => {
      throw new ApiError(parseApiProblem(409, { code: "attendance.locked", title: "Locked" }));
    });
    const [item] = await db.queue.all();
    expect(item!.refusedWhole).toBe("attendance.locked");
    await discardItem(db, item!.id!);
    expect(await unsyncedCount(db)).toBe(0);
  });

  it("stops on a lost connection and leaves everything pending", async () => {
    await enqueueMarks(db, KEY, [mark("s1")]);
    const report = await flushQueue(db, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(report.stopped).toBe("offline");
    expect(await unsyncedCount(db)).toBe(1);
    const [item] = await db.queue.all();
    expect(item!.state).toBe("pending");
  });

  it("stops on a server error and leaves everything pending", async () => {
    await enqueueMarks(db, KEY, [mark("s1")]);
    const report = await flushQueue(db, async () => {
      throw new ApiError(
        parseApiProblem(503, { code: "server.unavailable", title: "Unavailable" }),
      );
    });
    expect(report.stopped).toBe("server");
    expect((await db.queue.all())[0]!.state).toBe("pending");
  });

  it("stops on an expired session and leaves everything pending", async () => {
    await enqueueMarks(db, KEY, [mark("s1")]);
    const report = await flushQueue(db, async () => {
      throw new ApiError(
        parseApiProblem(401, { code: "auth.token_invalid", title: "Unauthorized" }),
      );
    });
    expect(report.stopped).toBe("session");
    expect((await db.queue.all())[0]!.state).toBe("pending");
  });

  it("reuses the same key on a retry, so a dropped response is applied once", async () => {
    const marks = [mark("s1")];
    await enqueueMarks(db, KEY, marks);
    const keys: string[] = [];
    await flushQueue(db, async (_a, _d, _b, key) => {
      keys.push(key);
      throw new TypeError("Failed to fetch");
    });
    await flushQueue(db, async (_a, _d, _b, key) => {
      keys.push(key);
      return answer([{ clientId: marks[0]!.clientId, studentId: "s1", result: "applied" }]);
    });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("sends an item once when two flushes overlap, because one flush runs at a time", async () => {
    const marks = [mark("s1")];
    await enqueueMarks(db, KEY, marks);
    let sent = 0;
    const send: SendRegister = async () => {
      sent += 1;
      await new Promise((r) => setTimeout(r, 20));
      return answer([{ clientId: marks[0]!.clientId, studentId: "s1", result: "applied" }]);
    };
    await Promise.all([flushQueue(db, send), flushQueue(db, send)]);
    expect(sent).toBe(1);
    expect(await unsyncedCount(db)).toBe(0);
  });

  it("wipes every record from the device", async () => {
    await enqueueMarks(db, KEY, [mark("s1")]);
    await db.rosters.put({
      registerKey: "k",
      studentIds: ["s1"],
      savedAt: "2026-11-02T08:00:00.000Z",
    });
    await wipeAttendanceStore();
    expect(await db.queue.count()).toBe(0);
    expect((await db.rosters.get("k")) === undefined ? 0 : 1).toBe(0);
  });
});
