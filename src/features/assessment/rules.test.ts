import { describe, expect, it } from "vitest";
import {
  cellKey,
  changedCells,
  draftFromServer,
  reopenReasonProblem,
  scoreProblem,
  scoreTenths,
  sheetActions,
  type ServerCell,
} from "./rules";

describe("scores are exact, one decimal place at most", () => {
  it("reads a blank cell as not entered, never as zero", () => {
    expect(scoreTenths("")).toBeNull();
    expect(scoreTenths("   ")).toBeNull();
    expect(scoreTenths("0")).toBe(0);
  });

  it("reads whole and one-decimal scores in tenths", () => {
    expect(scoreTenths("12")).toBe(120);
    expect(scoreTenths("12.5")).toBe(125);
    expect(scoreTenths("7.0")).toBe(70);
  });

  it("refuses more than one decimal, signs, and text", () => {
    expect(scoreTenths("12.55")).toBe("format");
    expect(scoreTenths("-3")).toBe("format");
    expect(scoreTenths("12.")).toBe("format");
    expect(scoreTenths("abc")).toBe("format");
  });
});

describe("a cell is checked against its component's maximum", () => {
  it("accepts a score up to and including the maximum", () => {
    expect(scoreProblem("15", 15, false)).toBeNull();
    expect(scoreProblem("14.9", 15, false)).toBeNull();
  });

  it("refuses a score above the maximum", () => {
    expect(scoreProblem("15.1", 15, false)).toBe("range");
    expect(scoreProblem("16", 15, false)).toBe("range");
  });

  it("refuses an absent student with a score", () => {
    expect(scoreProblem("8", 15, true)).toBe("absentWithScore");
    expect(scoreProblem("", 15, true)).toBeNull();
  });

  it("reports the format problem before the range", () => {
    expect(scoreProblem("1.23", 15, false)).toBe("format");
  });
});

describe("only changed cells are sent", () => {
  const server: ServerCell[] = [
    { studentId: "s1", componentId: "c1", score: 12.5, absent: false },
    { studentId: "s1", componentId: "c2", score: null, absent: false },
  ];

  it("reads server numbers as decimal text", () => {
    const draft = draftFromServer(server);
    expect(draft.get(cellKey("s1", "c1"))).toEqual({ score: "12.5", absent: false });
    expect(draft.get(cellKey("s1", "c2"))).toEqual({ score: "", absent: false });
  });

  it("sends nothing when the draft matches the server", () => {
    expect(changedCells(server, draftFromServer(server))).toEqual([]);
  });

  it("sends a changed score, and a cleared cell as null", () => {
    const draft = draftFromServer(server);
    draft.set(cellKey("s1", "c1"), { score: "13", absent: false });
    draft.set(cellKey("s1", "c2"), { score: "", absent: false });
    expect(changedCells(server, draft)).toEqual([
      { studentId: "s1", componentId: "c1", score: "13", absent: false },
    ]);
  });

  it("sends an absent cell with no score", () => {
    const draft = draftFromServer(server);
    draft.set(cellKey("s1", "c2"), { score: "5", absent: true });
    expect(changedCells(server, draft)).toEqual([
      { studentId: "s1", componentId: "c2", score: null, absent: true },
    ]);
  });
});

describe("a sheet's status decides the actions", () => {
  it("allows entry and submit only while it is a draft", () => {
    expect(sheetActions("Draft")).toEqual({
      canSave: true,
      canSubmit: true,
      canApprove: false,
      canReopen: false,
    });
  });

  it("allows approval when submitted, and reopen until published", () => {
    expect(sheetActions("Submitted")).toEqual({
      canSave: false,
      canSubmit: false,
      canApprove: true,
      canReopen: true,
    });
    expect(sheetActions("Approved").canReopen).toBe(true);
    expect(sheetActions("Published")).toEqual({
      canSave: false,
      canSubmit: false,
      canApprove: false,
      canReopen: false,
    });
  });
});

describe("a reopen needs a reason", () => {
  it("refuses a blank or very long reason", () => {
    expect(reopenReasonProblem("   ")).toBe("required");
    expect(reopenReasonProblem("x".repeat(301))).toBe("tooLong");
    expect(reopenReasonProblem("Wrong mark entered")).toBeNull();
  });
});
