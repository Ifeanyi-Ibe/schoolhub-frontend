import { describe, expect, it } from "vitest";
import { brandStyleSheet, validBrandHex } from "./brand-css";

describe("validBrandHex", () => {
  it("accepts exactly #RRGGBB, in either case", () => {
    expect(validBrandHex("#0f5c4d")).toBe("#0f5c4d");
    expect(validBrandHex("#C2410C")).toBe("#C2410C");
  });

  it.each([
    ["short form", "#fff"],
    ["no hash", "0f5c4d"],
    ["whitespace", " #0f5c4d"],
    ["trailing text", "#0f5c4d;"],
    ["a declaration break", "#000000;}body{display:none}"],
    ["a closing style tag", "</style><script>alert(1)</script>"],
    ["a function", "url(javascript:alert(1))"],
    ["a named colour", "red"],
    ["a non-hex digit", "#00000g"],
    ["an empty string", ""],
    ["a number", 123456],
    ["null", null],
  ])("rejects %s", (_label, input) => {
    expect(validBrandHex(input)).toBeNull();
  });
});

describe("brandStyleSheet", () => {
  it("applies the guarded colours to .tenant-brand, and only as #RRGGBB", () => {
    const css = brandStyleSheet("#c2410c");
    expect(css).toMatch(/^\.tenant-brand\{--brand:#[0-9a-f]{6};--on-brand:#[0-9a-f]{6}\}$/);
  });

  it("returns null for a hostile colour, so the default theme applies and nothing reaches the stylesheet", () => {
    const hostile = [
      "#000000;}body{background:url(https://evil.example/x)}",
      "</style><img src=x onerror=alert(1)>",
      "#0f5c4d}*{display:none",
      "expression(alert(1))",
    ];
    for (const value of hostile) expect(brandStyleSheet(value)).toBeNull();
  });

  it("never emits characters outside the accepted grammar, whatever the input", () => {
    const css = brandStyleSheet("#123456");
    expect(css).not.toBeNull();
    expect(css).not.toMatch(
      /[<>"'(){}]{2,}|javascript|expression|url\(/i.source
        ? /url\(|javascript|expression|<|>/i
        : /x/,
    );
  });
});
