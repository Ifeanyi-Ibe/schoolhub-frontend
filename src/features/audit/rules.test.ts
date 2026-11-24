import { describe, expect, it } from "vitest";
import { exportFinished, rangeProblem } from "./rules";

describe("an export is finished only when the server says so", () => {
  it("is finished when completed or failed, and not while queued or running", () => {
    expect(exportFinished("Completed")).toBe(true);
    expect(exportFinished("Failed")).toBe(true);
    expect(exportFinished("Queued")).toBe(false);
    expect(exportFinished("Running")).toBe(false);
  });
});

describe("the date range is in order", () => {
  it("refuses an end before its start, and allows an open end", () => {
    expect(rangeProblem("2026-11-02", "2026-11-01")).toBe("reversed");
    expect(rangeProblem("2026-11-01", "2026-11-02")).toBeNull();
    expect(rangeProblem("", "2026-11-02")).toBeNull();
  });
});
