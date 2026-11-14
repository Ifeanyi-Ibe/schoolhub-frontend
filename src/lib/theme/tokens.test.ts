// Every text token pair in globals.css must meet WCAG AA in both themes.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AA_NON_TEXT, AA_TEXT, contrastRatio, parseHex, type Rgb } from "./contrast";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector ${selector} not found`);
  const body = css.slice(start, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{3,6});/gi)) vars[m[1]!] = m[2]!;
  return vars;
}

const light = block(`[data-theme="light"]`);
const dark = block(`[data-theme="dark"]`);

const TEXT_PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "surface"],
  ["foreground", "surface-raised"],
  ["muted-foreground", "background"],
  ["muted-foreground", "surface"],
  ["muted-foreground", "muted"],
  ["danger", "surface"],
  ["danger", "background"],
  ["on-brand", "brand"],
  ["brand", "surface"],
  ["success-foreground", "success-surface"],
  ["warning-foreground", "warning-surface"],
  ["danger-foreground", "danger-surface"],
  ["info-foreground", "info-surface"],
  ["neutral-foreground", "neutral-surface"],
];

const NON_TEXT_PAIRS: [string, string][] = [
  ["ring", "surface"],
  ["input-border", "surface"],
  ["input-border", "background"],
];

function rgb(vars: Record<string, string>, name: string): Rgb {
  const v = vars[name];
  if (!v) throw new Error(`missing token --${name}`);
  const parsed = parseHex(v);
  if (!parsed) throw new Error(`bad colour for --${name}: ${v}`);
  return parsed;
}

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme tokens", (_name, vars) => {
  it.each(TEXT_PAIRS)("text --%s on --%s meets AA (4.5:1)", (fg, bg) => {
    expect(contrastRatio(rgb(vars, fg), rgb(vars, bg))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(NON_TEXT_PAIRS)("non-text --%s against --%s meets 3:1", (fg, bg) => {
    expect(contrastRatio(rgb(vars, fg), rgb(vars, bg))).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

it("keeps the reduced-motion and focus rules in the stylesheet", () => {
  expect(css).toContain("prefers-reduced-motion: reduce");
  expect(css).toContain(":focus-visible");
});
