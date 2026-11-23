import { describe, expect, it } from "vitest";
import { countText, notIncludedList, percentText } from "./rules";

describe("a count from the server is shown as it is, never as zero when missing", () => {
  it("shows a whole number, a numeric string, and a dash for a missing value", () => {
    expect(countText(12)).toBe("12");
    expect(countText("7")).toBe("7");
    expect(countText(null)).toBe("—");
    expect(countText("x")).toBe("—");
  });
});

describe("a percentage is shown to one decimal place", () => {
  it("formats the value, and dashes a missing one", () => {
    expect(percentText(66.66)).toBe("66.7%");
    expect(percentText(null)).toBe("—");
  });
});

describe("the panels the server did not include", () => {
  it("are listed as the server names them, without blanks", () => {
    expect(notIncludedList(["statement", "", "virtual accounts"])).toEqual([
      "statement",
      "virtual accounts",
    ]);
  });
});
