import { describe, expect, it } from "vitest";
import { PATTERNS, requiredText } from "./rules";

describe("client rules", () => {
  it("treats a blank or spaces-only value as missing", () => {
    const rule = requiredText("Enter it") as { validate: (v: unknown) => true | string };
    expect(rule.validate("   ")).toBe("Enter it");
    expect(rule.validate("a")).toBe(true);
  });

  it("accepts the code shapes the BFF accepts", () => {
    expect(PATTERNS.otp.test("123456")).toBe(true);
    expect(PATTERNS.otp.test("12345")).toBe(false);
    expect(PATTERNS.code.test("AB12-CD34")).toBe(true);
    expect(PATTERNS.code.test("bad code!")).toBe(false);
    expect(PATTERNS.phone.test("+2348000000000")).toBe(true);
    expect(PATTERNS.phone.test("12")).toBe(false);
  });
});
