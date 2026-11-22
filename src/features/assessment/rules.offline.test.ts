import { describe, expect, it } from "vitest";
import { draftFromServer, overlayRows, scoreRowKind, sheetKeyOf } from "./rules";

describe("the sheet key", () => {
  it("is term, arm and subject, in that order", () => {
    expect(sheetKeyOf({ termId: "t", classArmId: "a", subjectId: "s" })).toBe("t|a|s");
  });
});

describe("what the server said about a row", () => {
  it("reads the backend's spellings, whatever their capitals", () => {
    expect(scoreRowKind("applied")).toBe("applied");
    expect(scoreRowKind("Applied")).toBe("applied");
    expect(scoreRowKind("IgnoredNewerExists")).toBe("ignored");
    expect(scoreRowKind("ignored")).toBe("ignored");
  });

  it("treats anything else as a refusal the teacher must see", () => {
    expect(scoreRowKind("rejected")).toBe("refused");
    expect(scoreRowKind("")).toBe("refused");
  });
});

describe("queued cells show over the server's values", () => {
  it("replaces the cells that were queued and keeps the rest", () => {
    const server = draftFromServer([
      { studentId: "s1", componentId: "c1", score: 10, absent: false },
      { studentId: "s1", componentId: "c2", score: null, absent: false },
    ]);
    const shown = overlayRows(server, [
      { studentId: "s1", componentId: "c1", score: "12.5", absent: false },
      { studentId: "s1", componentId: "c2", score: null, absent: true },
    ]);
    expect(shown.get("s1|c1")).toEqual({ score: "12.5", absent: false });
    expect(shown.get("s1|c2")).toEqual({ score: "", absent: true });
    expect(server.get("s1|c1")).toEqual({ score: "10", absent: false });
  });
});
