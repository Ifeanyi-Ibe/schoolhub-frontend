import { describe, expect, it } from "vitest";
import { formatCalendarDate, formatInstant } from "./dates";

describe("formatCalendarDate", () => {
  it("shows the calendar day the API sent, regardless of the viewer's timezone", () => {
    expect(formatCalendarDate("2034-09-04")).toBe("4 Sept 2034");
    expect(formatCalendarDate("2026-01-01")).toBe("1 Jan 2026");
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(() => formatCalendarDate("04/09/2034")).toThrow(RangeError);
  });
});

describe("formatInstant", () => {
  it("converts a UTC instant to Africa/Lagos (UTC+1, no DST)", () => {
    expect(formatInstant("2026-06-01T23:30:00Z")).toBe("2 Jun 2026, 00:30");
  });

  it("rejects an invalid instant", () => {
    expect(() => formatInstant("yesterday")).toThrow(RangeError);
  });
});
