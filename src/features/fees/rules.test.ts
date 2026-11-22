import { describe, expect, it } from "vitest";
import {
  adjustmentProblems,
  discountValueProblem,
  koboToNairaText,
  manualPaymentProblems,
  nairaToKobo,
  reasonProblem,
  structureLinesProblems,
} from "./rules";

describe("naira to kobo, exactly", () => {
  it("reads whole and two-decimal amounts without floating-point drift", () => {
    expect(nairaToKobo("1500")).toBe(150000);
    expect(nairaToKobo("1,500.5")).toBe(150050);
    expect(nairaToKobo("0.1")).toBe(10);
    expect(nairaToKobo("0.07")).toBe(7);
    expect(nairaToKobo(" 2500.00 ")).toBe(250000);
  });

  it("refuses anything it cannot read exactly, and zero or negatives", () => {
    expect(nairaToKobo("1500.555")).toBeNull();
    expect(nairaToKobo("abc")).toBeNull();
    expect(nairaToKobo("-5")).toBeNull();
    expect(nairaToKobo("0")).toBeNull();
    expect(nairaToKobo("")).toBeNull();
  });

  it("formats kobo back as naira text for a form", () => {
    expect(koboToNairaText(150050)).toBe("1500.50");
    expect(koboToNairaText(7)).toBe("0.07");
  });
});

describe("the forms", () => {
  it("checks structure lines: an item, an amount, and each item once", () => {
    expect(structureLinesProblems([{ feeItemId: "a", amount: "100", isOptional: false }])).toEqual(
      [],
    );
    expect(
      structureLinesProblems([
        { feeItemId: "a", amount: "100", isOptional: false },
        { feeItemId: "a", amount: "0", isOptional: true },
      ]),
    ).toEqual(["amount", "duplicateItem"]);
    expect(structureLinesProblems([{ feeItemId: "", amount: "5", isOptional: false }])).toEqual([
      "feeItemRequired",
    ]);
  });

  it("checks a manual payment: student, amount, method and a reference", () => {
    const ok = { studentId: "s", amount: "5000", method: "Cash", reference: "RCPT-1" };
    expect(manualPaymentProblems(ok)).toEqual([]);
    expect(manualPaymentProblems({ ...ok, amount: "0", method: "Crypto", reference: " " })).toEqual(
      expect.arrayContaining(["amount", "method", "referenceRequired"]),
    );
  });

  it("checks an adjustment and a reason, and a discount's value", () => {
    expect(adjustmentProblems({ kind: "Credit", amount: "200", reason: "Overcharged" })).toEqual(
      [],
    );
    expect(adjustmentProblems({ kind: "Credit", amount: "200", reason: "" })).toEqual([
      "reasonRequired",
    ]);
    expect(reasonProblem("x".repeat(301))).toBe("reasonLength");
    expect(discountValueProblem("Percentage", "101")).toBe("percentRange");
    expect(discountValueProblem("Percentage", "25")).toBeNull();
    expect(discountValueProblem("Fixed", "1000.5")).toBeNull();
  });
});
