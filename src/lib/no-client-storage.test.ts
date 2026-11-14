// Tokens and personal data never go to browser storage (CLAUDE.md, security). This scans the
// source so that a future change cannot quietly add localStorage or sessionStorage.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("no client storage", () => {
  it("source never reads or writes localStorage or sessionStorage", () => {
    const offenders = files(resolve(process.cwd(), "src")).filter((f) => {
      const text = readFileSync(f, "utf8");
      return /\b(localStorage|sessionStorage)\b/.test(text) && !f.endsWith("eslint.config.mjs");
    });
    expect(offenders).toEqual([]);
  });
});
