import { describe, expect, it } from "vitest";
import { isOpenRequest, reasonProblem, REASON_MAX, subjectProblem } from "./rules";

describe("a subject is named by its type and its id", () => {
  it("needs both", () => {
    expect(subjectProblem("", "x")).toBe("typeRequired");
    expect(subjectProblem("Student", " ")).toBe("idRequired");
    expect(subjectProblem("Student", "0190")).toBeNull();
  });
});

describe("a data request needs a reason of a sensible length", () => {
  it("refuses a blank or very long reason", () => {
    expect(reasonProblem("  ")).toBe("required");
    expect(reasonProblem("x".repeat(REASON_MAX + 1))).toBe("tooLong");
    expect(reasonProblem("Parent asked for a copy")).toBeNull();
  });
});

describe("a data request is open until it is decided", () => {
  it("is open with no decision", () => {
    expect(isOpenRequest({ decidedAt: null })).toBe(true);
    expect(isOpenRequest({ decidedAt: "2026-11-22T08:00:00Z" })).toBe(false);
  });
});
