import { describe, expect, it } from "vitest";
import { jobFinished, jobProgressPercent, ratingProblem, remarkProblem, REMARK_MAX } from "./rules";

describe("a rating is a whole number from 1 to 5", () => {
  it("leaves a blank rating alone, and accepts 1 to 5", () => {
    expect(ratingProblem("")).toBeNull();
    expect(ratingProblem("1")).toBeNull();
    expect(ratingProblem(" 5 ")).toBeNull();
  });

  it("refuses a fraction, a sign or text, and a number out of range", () => {
    expect(ratingProblem("3.5")).toBe("notWhole");
    expect(ratingProblem("-1")).toBe("notWhole");
    expect(ratingProblem("x")).toBe("notWhole");
    expect(ratingProblem("0")).toBe("range");
    expect(ratingProblem("6")).toBe("range");
  });
});

describe("a job is finished when its items are done, or its status says so", () => {
  it("is not finished while items remain and the status is unknown", () => {
    expect(jobFinished({ status: "Running", total: 4, done: 2 })).toBe(false);
  });

  it("is finished when every item is done, whatever the status", () => {
    expect(jobFinished({ status: "Queued", total: 4, done: 4 })).toBe(true);
  });

  it("is finished on a completed or failed status, and on an error", () => {
    expect(jobFinished({ status: "Completed", total: 4, done: 1 })).toBe(true);
    expect(jobFinished({ status: "Failed", total: 4, done: 1 })).toBe(true);
    expect(jobFinished({ status: "Running", total: 4, done: 1, error: "boom" })).toBe(true);
  });

  it("does not treat a job with no items as done", () => {
    expect(jobFinished({ status: "Running", total: 0, done: 0 })).toBe(false);
  });
});

describe("job progress", () => {
  it("is a share of the items, capped at 100 and zero with no items", () => {
    expect(jobProgressPercent({ total: 4, done: 1 })).toBe(25);
    expect(jobProgressPercent({ total: 0, done: 0 })).toBe(0);
    expect(jobProgressPercent({ total: 2, done: 5 })).toBe(100);
  });
});

describe("a remark is free text with a length the screen allows", () => {
  it("accepts a remark up to the limit, and refuses more", () => {
    expect(remarkProblem("Good progress")).toBeNull();
    expect(remarkProblem("x".repeat(REMARK_MAX))).toBeNull();
    expect(remarkProblem("x".repeat(REMARK_MAX + 1))).toBe("tooLong");
  });
});
