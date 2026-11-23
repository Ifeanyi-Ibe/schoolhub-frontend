import { describe, expect, it } from "vitest";
import { canRetry, ratePercent, templateProblem } from "./rules";

describe("a template needs a body", () => {
  it("refuses a blank body and accepts text", () => {
    expect(templateProblem("  ")).toBe("bodyRequired");
    expect(templateProblem("Fees are due")).toBeNull();
  });
});

describe("a message can be retried only after a failed attempt that was never delivered", () => {
  it("is retryable with an error and no delivery", () => {
    expect(canRetry({ lastError: "timeout", deliveredAt: null })).toBe(true);
  });

  it("is not retryable when it was delivered, or when nothing failed", () => {
    expect(canRetry({ lastError: "timeout", deliveredAt: "2026-11-20T08:00:00Z" })).toBe(false);
    expect(canRetry({ lastError: null, deliveredAt: null })).toBe(false);
  });
});

describe("a rate is shown to one decimal place, or as a dash when there is none", () => {
  it("formats a number or a numeric string, and dashes a missing rate", () => {
    expect(ratePercent(93.456)).toBe("93.5%");
    expect(ratePercent("100")).toBe("100.0%");
    expect(ratePercent(null)).toBe("—");
    expect(ratePercent("not a number")).toBe("—");
  });
});
