import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { failedChecks, isSupported, SUPPORT_CHECKS, type SupportEnv } from "./support";

const modern: SupportEnv = {
  declSupported: () => true,
  selectorSupported: () => true,
  apiPresent: () => true,
};

describe("browser support", () => {
  it("accepts a browser that passes every check", () => {
    expect(isSupported(modern)).toBe(true);
  });

  it("names exactly the checks an older browser fails", () => {
    const old: SupportEnv = { ...modern, declSupported: (_p, v) => !v.startsWith("oklch") };
    expect(failedChecks(old)).toEqual(["oklch"]);
    expect(isSupported(old)).toBe(false);
  });

  it("treats a missing API as unsupported", () => {
    expect(failedChecks({ ...modern, apiPresent: () => false }).sort()).toEqual([
      "readable-stream",
      "register-property",
    ]);
  });

  it("keeps the browser-check.js copy identical to SUPPORT_CHECKS", () => {
    const script = readFileSync(resolve(process.cwd(), "public/browser-check.js"), "utf8");
    const m = /\/\*CHECKS:\*\/([\s\S]*?)\/\*END\*\//.exec(script);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1]!)).toEqual(SUPPORT_CHECKS);
  });
});
