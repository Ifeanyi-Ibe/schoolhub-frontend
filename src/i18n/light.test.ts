// Parity: the light formatter must produce what intl-messageformat produces, for every message the
// parent portal and the shared components are served (LIGHT_MESSAGE_PATHS), for representative values.
// Plural and select are covered by synthetic messages too, including 0, 1, 2 and many.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import IntlMessageFormat from "intl-messageformat";
import { describe, expect, it } from "vitest";
import { LIGHT_MESSAGE_PATHS, pickPaths } from "./client-namespaces";
import { formatLight } from "./light";

const catalogue = JSON.parse(
  readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8"),
) as Record<string, unknown>;

function leaves(node: unknown, prefix = ""): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

const NUMBERS = [0, 1, 2, 5, 12];
const STRINGS = ["Ada Okafor"];

/** The argument names a template uses, and for each select argument its keys. */
function argumentsOf(template: string): {
  numeric: Set<string>;
  text: Set<string>;
  selects: Map<string, string[]>;
} {
  const numeric = new Set<string>();
  const text = new Set<string>();
  const selects = new Map<string, string[]>();
  for (const m of template.matchAll(
    /\{\s*([A-Za-z_][\w]*)\s*(?:,\s*(plural|select)\s*,([^]*?))?\}/g,
  )) {
    const name = m[1]!;
    if (m[2] === "plural") numeric.add(name);
    else if (m[2] === "select") {
      const keys = [...(m[3] ?? "").matchAll(/(\w+)\s*\{/g)].map((k) => k[1]!);
      selects.set(name, keys);
    } else text.add(name);
  }
  return { numeric, text, selects };
}

/** Every value combination the template can take, from a small representative set. */
function combinations(template: string): Array<Record<string, string | number>> {
  const { numeric, text, selects } = argumentsOf(template);
  let combos: Array<Record<string, string | number>> = [{}];
  const extend = (name: string, options: Array<string | number>) => {
    combos = combos.flatMap((c) => options.map((o) => ({ ...c, [name]: o })));
  };
  for (const n of numeric) extend(n, NUMBERS);
  for (const n of text) extend(n, STRINGS);
  for (const [n, keys] of selects) extend(n, keys.length ? keys : ["other"]);
  return combos;
}

function parityFor(template: string, values: Record<string, string | number>) {
  const expected = new IntlMessageFormat(template, "en").format(values);
  return formatLight(template, values, "en") === expected;
}

describe("served catalogue messages", () => {
  const served = LIGHT_MESSAGE_PATHS.flatMap((path) =>
    leaves(pickPaths(catalogue, [path])[path.split(".")[0]!]),
  );
  it("serves at least one message per namespace", () => {
    expect(served.length).toBeGreaterThan(20);
  });

  it.each(served)("%s matches intl-messageformat", (_path, template) => {
    for (const values of combinations(template)) {
      expect(formatLight(template, values, "en"), JSON.stringify(values)).toBe(
        new IntlMessageFormat(template, "en").format(values),
      );
    }
  });
});

describe("synthetic cases the catalogue does not use yet", () => {
  const cases: Array<[string, Record<string, string | number>]> = [
    ["You have {n, plural, =0 {no messages} one {# message} other {# messages}}", { n: 0 }],
    ["You have {n, plural, =0 {no messages} one {# message} other {# messages}}", { n: 1 }],
    ["You have {n, plural, =0 {no messages} one {# message} other {# messages}}", { n: 2 }],
    ["You have {n, plural, =0 {no messages} one {# message} other {# messages}}", { n: 12 }],
    ["{g, select, female {She} male {He} other {They}} replied", { g: "female" }],
    ["{g, select, female {She} male {He} other {They}} replied", { g: "other-value" }],
    ["Don''t forget {name}", { name: "Ada" }],
    ["'{literal}' braces and {name}", { name: "Ada" }],
    ["Tom''s {n, plural, one {# day} other {# days}}", { n: 2 }],
    ["{n, plural, other {# items, {name} included}}", { n: 5, name: "Ada" }],
  ];
  it.each(cases)("%s with %j", (template, values) => {
    expect(parityFor(template, values)).toBe(true);
  });

  it("refuses argument types it does not implement, rather than guessing", () => {
    expect(() => formatLight("Due {d, date, short}", { d: "x" }, "en")).toThrow(/unsupported/);
    expect(() => formatLight("Total {n, number}", { n: 1 }, "en")).toThrow(/unsupported/);
  });

  it("throws on a missing value (the hook returns the key path instead)", () => {
    expect(() => formatLight("Hello {name}", {}, "en")).toThrow(/missing value/);
  });
});
