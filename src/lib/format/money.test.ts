import { describe, expect, it } from "vitest";
import { formatNaira } from "./money";

describe("formatNaira", () => {
  it("formats integer kobo as naira with two decimals", () => {
    expect(formatNaira(0)).toBe("₦0.00");
    expect(formatNaira(5)).toBe("₦0.05");
    expect(formatNaira(123450)).toBe("₦1,234.50");
    expect(formatNaira(45_000_000)).toBe("₦450,000.00");
  });

  it("keeps a leading minus for negative balances", () => {
    expect(formatNaira(-1250)).toBe("-₦12.50");
  });

  it("is exact for large amounts, using bigint", () => {
    expect(formatNaira(9_007_199_254_740_991n)).toBe("₦90,071,992,547,409.91");
  });

  it("refuses fractional or unsafe numbers instead of rounding money", () => {
    expect(() => formatNaira(12.5)).toThrow(RangeError);
    expect(() => formatNaira(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });
});
