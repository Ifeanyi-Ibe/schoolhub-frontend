import { describe, expect, it } from "vitest";
import { AA_TEXT, bestTextOn, contrastRatio, guardBrandColor, parseHex, toHex } from "./contrast";

describe("contrast maths", () => {
  it("matches the WCAG reference values for black on white (21:1) and identical colours (1:1)", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([10, 20, 30], [10, 20, 30])).toBeCloseTo(1, 5);
  });

  it("parses 3 and 6 digit hex and rejects anything else", () => {
    expect(parseHex("#0f0")).toEqual([0, 255, 0]);
    expect(parseHex("0F5C4D")).toEqual([15, 92, 77]);
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("red")).toBeNull();
    expect(toHex([15, 92, 77])).toBe("#0f5c4d");
  });

  it("picks the more readable text colour", () => {
    expect(bestTextOn([255, 255, 255]).text).toEqual([0, 0, 0]);
    expect(bestTextOn([0, 0, 0]).text).toEqual([255, 255, 255]);
  });
});

describe("guardBrandColor", () => {
  it("keeps a colour that already passes AA with white text", () => {
    const g = guardBrandColor("#0f5c4d");
    expect(g).toMatchObject({ accent: "#0f5c4d", onAccent: "#ffffff", adjusted: false });
    expect(g.ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("darkens a light school colour until white text meets AA, keeping its hue", () => {
    const g = guardBrandColor("#fde68a");
    expect(g.adjusted).toBe(true);
    expect(g.onAccent).toBe("#ffffff");
    expect(g.ratio).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(parseHex(g.accent)!, [255, 255, 255])).toBeGreaterThanOrEqual(AA_TEXT);
    // Yellow-amber hue is preserved: red stays the strongest channel.
    const [r, , b] = parseHex(g.accent)!;
    expect(r).toBeGreaterThan(b);
  });

  it("lightens a colour instead when black text is requested", () => {
    const dark = guardBrandColor("#1e3a8a", { textOn: "black" });
    expect(dark.onAccent).toBe("#000000");
    expect(dark.adjusted).toBe(true);
    expect(dark.ratio).toBeGreaterThanOrEqual(AA_TEXT);
    expect(guardBrandColor("#fde68a", { textOn: "black" }).adjusted).toBe(false);
  });

  it("adjusts a mid-grey that fails white text", () => {
    const g = guardBrandColor("#808080");
    expect(g.adjusted).toBe(true);
    expect(g.ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("falls back to the platform accent for invalid input, and says so", () => {
    const g = guardBrandColor("not-a-colour");
    expect(g.adjusted).toBe(true);
    expect(g.accent).toBe("#0f5c4d");
    expect(g.ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
