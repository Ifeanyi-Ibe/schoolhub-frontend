import { describe, expect, it } from "vitest";
import {
  arrivalProblem,
  hasOpenRows,
  markProblems,
  queuedMarks,
  registerKey,
  rowResult,
  type MarkDraft,
} from "./rules";

const row = (over: Partial<MarkDraft> = {}): MarkDraft => ({
  studentId: "s1",
  status: "Present",
  arrivalTime: "",
  note: "",
  ...over,
});

describe("the register key", () => {
  it("is one key per class arm, day and period, and the daily register has no period", () => {
    expect(registerKey({ classArmId: "a", date: "2026-11-02", period: null })).toBe(
      "a|2026-11-02|",
    );
    expect(registerKey({ classArmId: "a", date: "2026-11-02", period: "P2" })).toBe(
      "a|2026-11-02|P2",
    );
  });
});

describe("arrival times", () => {
  it("is only for a late arrival, and must be a 24-hour time", () => {
    expect(arrivalProblem("Late", "08:35")).toBeNull();
    expect(arrivalProblem("Late", "")).toBeNull();
    expect(arrivalProblem("Late", "8.35am")).toBe("arrivalFormat");
    expect(arrivalProblem("Present", "08:00")).toBe("arrivalOnlyWhenLate");
  });
});

describe("saving a register", () => {
  it("needs a status for every row before it is saved", () => {
    expect(markProblems([row(), row({ studentId: "s2", status: null })])).toEqual([
      "statusRequired",
    ]);
    expect(markProblems([row(), row({ studentId: "s2", status: "Absent" })])).toEqual([]);
  });

  it("queues only the marked rows, each with its own client id and the time it was taken", () => {
    let n = 0;
    const now = new Date("2026-11-02T08:15:00.000Z");
    const queued = queuedMarks(
      [
        row({ studentId: "s1" }),
        row({ studentId: "s2", status: null }),
        row({ studentId: "s3", status: "Late", arrivalTime: "08:20" }),
      ],
      now,
      () => `id-${++n}`,
    );
    expect(queued).toEqual([
      {
        studentId: "s1",
        status: "Present",
        arrivalTime: null,
        clientId: "id-1",
        clientUpdatedAt: now.toISOString(),
      },
      {
        studentId: "s3",
        status: "Late",
        arrivalTime: "08:20",
        clientId: "id-2",
        clientUpdatedAt: now.toISOString(),
      },
    ]);
  });

  it("never queues a note: notes are written online only (ADR 0017)", () => {
    const [mark] = queuedMarks([row({ note: "Left early for a clinic" })], new Date(), () => "id");
    expect(Object.keys(mark!)).not.toContain("note");
    expect(JSON.stringify(mark)).not.toContain("clinic");
  });
});

describe("reading the server's row results", () => {
  it("settles an applied or ignored row, and keeps anything else for the teacher", () => {
    expect(rowResult("applied")).toBe("applied");
    expect(rowResult("ignored_newer_exists")).toBe("ignored");
    expect(rowResult("rejected")).toBe("needsAttention");
    expect(rowResult("Applied")).toBe("applied");
    expect(rowResult("IgnoredNewerExists")).toBe("ignored");
    expect(rowResult("something_new")).toBe("needsAttention");
  });

  it("has open rows while any row needs attention", () => {
    expect(hasOpenRows([{ result: "applied" }, { result: "ignored" }])).toBe(false);
    expect(hasOpenRows([{ result: "applied" }, { result: "needsAttention" }])).toBe(true);
  });
});
