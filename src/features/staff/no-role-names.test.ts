// Authorization in the UI comes from effective permissions (GET /me), never from role names (CLAUDE.md).
// This test fails if application code compares against a role name, in either position of a comparison,
// or uses one with includes, startsWith, endsWith or a switch case. Tests and the catalogue are excluded.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROLE_NAMES = [
  "SchoolAdmin",
  "Registrar",
  "Bursar",
  "Teacher",
  "FormTeacher",
  "Parent",
  "Student",
];
const NAME = `(?:${ROLE_NAMES.join("|")})`;
const PATTERNS = [
  new RegExp(`(===|!==|==|!=)\\s*["'\`]${NAME}["'\`]`),
  new RegExp(`["'\`]${NAME}["'\`]\\s*(===|!==|==|!=)`),
  new RegExp(`\\.(includes|startsWith|endsWith|indexOf)\\(\\s*["'\`]${NAME}["'\`]`),
  new RegExp(`case\\s+["'\`]${NAME}["'\`]\\s*:`),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) return [];
    return [path];
  });
}

describe("no authorization by role name", () => {
  it("application code never compares against a role name", () => {
    const root = resolve(__dirname, "../../..");
    const offenders: string[] = [];
    for (const file of sourceFiles(join(root, "src"))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (PATTERNS.some((p) => p.test(line)))
            offenders.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("the scan itself catches a comparison in either position", () => {
    expect(PATTERNS.some((p) => p.test(`if (role === "SchoolAdmin") {}`))).toBe(true);
    expect(PATTERNS.some((p) => p.test(`if ("Registrar" !== name) {}`))).toBe(true);
    expect(PATTERNS.some((p) => p.test(`roles.includes("Bursar")`))).toBe(true);
    expect(PATTERNS.some((p) => p.test(`case "Teacher":`))).toBe(true);
    expect(PATTERNS.some((p) => p.test(`const label = name === undefined ? "x" : "y";`))).toBe(
      false,
    );
  });
});
