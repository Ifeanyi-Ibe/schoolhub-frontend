import { describe, expect, it } from "vitest";
import { amountLabel, isPayable } from "./rules";

describe("an invoice is payable until it has a payment date", () => {
  it("is payable when unpaid, and not when paid", () => {
    expect(isPayable({ paidAt: null })).toBe(true);
    expect(isPayable({ paidAt: "2026-11-01T08:00:00Z" })).toBe(false);
  });
});

describe("an amount is shown as naira only in naira", () => {
  it("formats NGN as naira in kobo, and any other currency as its code", () => {
    expect(amountLabel(1500000, "NGN")).toEqual({ naira: true, text: "1500000" });
    expect(amountLabel(1500000, "USD")).toEqual({ naira: false, text: "1500000 USD" });
  });
});
