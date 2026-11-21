import { describe, expect, it } from "vitest";
import {
  sessionProblems,
  termProblems,
  calendarProblems,
  checkBands,
  checkComponents,
  isIsoDate,
  subjectProblems,
  wholeNumber,
  type BandDraft,
} from "./catalogue-rules";

const band = (min: string, max: string, grade = "A", remark = "Excellent"): BandDraft => ({
  min,
  max,
  grade,
  remark,
});

describe("grading bands", () => {
  it("accepts bands that cover 0 to 100 with no gap and no overlap", () => {
    const result = checkBands([
      band("0", "39", "F"),
      band("40", "69", "C"),
      band("70", "100", "A"),
    ]);
    expect(result.valid).toBe(true);
    expect(result.overall).toEqual([]);
  });

  it("accepts the bands in any order", () => {
    expect(checkBands([band("70", "100"), band("0", "69")]).valid).toBe(true);
  });

  it("reports an overlap", () => {
    const result = checkBands([band("0", "50"), band("50", "100")]);
    expect(result.valid).toBe(false);
    expect(result.overall).toContain("bands.overlap");
  });

  it("reports a gap between two bands", () => {
    const result = checkBands([band("0", "39"), band("41", "100")]);
    expect(result.valid).toBe(false);
    expect(result.overall).toContain("bands.gap");
  });

  it("requires the scale to start at 0 and end at 100", () => {
    expect(checkBands([band("1", "100")]).overall).toContain("bands.start");
    expect(checkBands([band("0", "99")]).overall).toContain("bands.end");
  });

  it("rejects a range outside 0 to 100, or with min above max, on its own row", () => {
    const result = checkBands([band("0", "101"), band("60", "40")]);
    expect(result.rows[0]).toContain("band.range");
    expect(result.rows[1]).toContain("band.range");
    expect(result.valid).toBe(false);
  });

  it("requires a grade and a remark on every band", () => {
    const result = checkBands([band("0", "100", "", " ")]);
    expect(result.rows[0]).toEqual(["band.grade", "band.remark"]);
    expect(result.valid).toBe(false);
  });

  it("needs at least one band", () => {
    expect(checkBands([]).overall).toEqual(["bands.none"]);
  });

  it("treats a score that is not a whole number as a number problem", () => {
    expect(checkBands([band("0.5", "100")]).rows[0]).toEqual(["band.number"]);
    expect(wholeNumber(" 42 ")).toBe(42);
    expect(wholeNumber("4.2")).toBeNull();
  });
});

describe("assessment components", () => {
  it("adds the maximum scores into a running total", () => {
    const result = checkComponents([
      { name: "Test", maxScore: "20" },
      { name: "Exam", maxScore: "60" },
      { name: "Project", maxScore: "20" },
    ]);
    expect(result.running).toEqual([20, 80, 100]);
    expect(result.total).toBe(100);
    expect(result.valid).toBe(true);
  });

  it("requires the maximum scores to add up to exactly 100", () => {
    const short = checkComponents([{ name: "Test", maxScore: "30" }]);
    expect(short.valid).toBe(false);
    expect(short.overall).toEqual(["components.total"]);
    const over = checkComponents([
      { name: "Test", maxScore: "60" },
      { name: "Exam", maxScore: "50" },
    ]);
    expect(over.overall).toEqual(["components.total"]);
  });

  it("rejects a component with no name, or a maximum that is not a positive whole number", () => {
    const result = checkComponents([
      { name: "", maxScore: "50" },
      { name: "Exam", maxScore: "0" },
      { name: "Quiz", maxScore: "x" },
    ]);
    expect(result.rows).toEqual([["component.name"], ["component.max"], ["component.max"]]);
    expect(result.valid).toBe(false);
  });

  it("needs at least one component", () => {
    expect(checkComponents([]).overall).toEqual(["components.none"]);
  });
});

describe("subjects and calendar days", () => {
  it("requires a code, a name and a category from the backend's values", () => {
    expect(subjectProblems({ code: "", name: "", category: "Maths" })).toEqual([
      "subject.code",
      "subject.name",
      "subject.category",
    ]);
    expect(subjectProblems({ code: "MTH", name: "Mathematics", category: "Core" })).toEqual([]);
  });

  it("accepts only real calendar dates in YYYY-MM-DD form", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  it("checks a calendar day's date, type and name", () => {
    expect(
      calendarProblems({ date: "2026-10-01", type: "Holiday", name: "Independence Day" }),
    ).toEqual([]);
    expect(calendarProblems({ date: "nope", type: "Party", name: " " })).toEqual([
      "calendar.date",
      "calendar.type",
      "calendar.name",
    ]);
  });
});

describe("sessions and terms", () => {
  it("needs a name and real dates, with the end on or after the start", () => {
    expect(
      sessionProblems({ name: "2026/2027", startsOn: "2026-09-07", endsOn: "2027-07-23" }),
    ).toEqual([]);
    expect(sessionProblems({ name: "", startsOn: "2026-09-07", endsOn: "2026-09-06" })).toEqual([
      "session.name",
      "session.order",
    ]);
    expect(sessionProblems({ name: "x", startsOn: "nope", endsOn: "2027-02-30" })).toEqual([
      "session.start",
      "session.end",
    ]);
  });

  it("needs a term number from 1 to 99, a name and ordered dates", () => {
    const ok = { number: "1", name: "First term", startsOn: "2026-09-07", endsOn: "2026-12-18" };
    expect(termProblems(ok)).toEqual([]);
    expect(termProblems({ ...ok, number: "0" })).toContain("term.number");
    expect(termProblems({ ...ok, number: "1.5" })).toContain("term.number");
    expect(termProblems({ ...ok, endsOn: "2026-01-01" })).toEqual(["term.order"]);
  });
});
