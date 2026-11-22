import { describe, expect, it } from "vitest";
import { admissionForCopy, paymentOutcome } from "./rules";

describe("a payment is confirmed only by the server's status", () => {
  it("confirms a succeeded payment, reports a failure, and treats anything else as not yet confirmed", () => {
    expect(paymentOutcome("Succeeded")).toBe("confirmed");
    expect(paymentOutcome("Failed")).toBe("failed");
    expect(paymentOutcome("Pending")).toBe("pending");
    expect(paymentOutcome("SomethingNew")).toBe("pending");
  });
});

describe("the admission number a parent copies", () => {
  it("is copied as typed, without the spaces around it", () => {
    expect(admissionForCopy("  GFA/0101 ")).toBe("GFA/0101");
  });
});
