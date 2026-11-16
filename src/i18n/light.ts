// Light message formatting for the parent portal and the shared components. It reads the same catalogue
// (messages/en.json) as next-intl and must produce the same output for every message it serves (see
// light.test.ts, which compares the two for representative values). It imports nothing from next-intl,
// so the ICU parser stays out of routes that do not need the full formatter (ADR 0013).
//
// Supported: literal text, ICU apostrophes, {name}, {name, plural, =N {…} one {…} other {…}} with #,
// and {name, select, key {…} other {…}}. Anything else throws, and the parity test makes sure no served
// message uses it.

export type LightValue = string | number | boolean | null | undefined;
export type LightValues = Readonly<Record<string, LightValue>>;

type Node =
  | { kind: "text"; value: string }
  | { kind: "arg"; name: string }
  | { kind: "plural"; name: string; exact: Map<number, Node[]>; cases: Map<string, Node[]> }
  | { kind: "select"; name: string; cases: Map<string, Node[]> };

const cache = new Map<string, Node[]>();

function parse(template: string): Node[] {
  const hit = cache.get(template);
  if (hit) return hit;
  const p = new Parser(template);
  const nodes = p.message(false);
  if (p.pos !== template.length) throw new Error(`light: unexpected "}" in "${template}"`);
  cache.set(template, nodes);
  return nodes;
}

class Parser {
  pos = 0;
  constructor(private readonly s: string) {}

  message(inPlural: boolean): Node[] {
    const out: Node[] = [];
    let text = "";
    const flush = () => {
      if (text !== "") out.push({ kind: "text", value: text });
      text = "";
    };
    while (this.pos < this.s.length) {
      const c = this.s[this.pos]!;
      if (c === "'") {
        const next = this.s[this.pos + 1];
        if (next === "'") {
          text += "'";
          this.pos += 2;
        } else if (next === "{" || next === "}" || (inPlural && next === "#")) {
          // A quoted run: everything up to the closing apostrophe is literal.
          this.pos += 1;
          while (this.pos < this.s.length) {
            const q = this.s[this.pos]!;
            if (q === "'" && this.s[this.pos + 1] === "'") {
              text += "'";
              this.pos += 2;
            } else if (q === "'") {
              this.pos += 1;
              break;
            } else {
              text += q;
              this.pos += 1;
            }
          }
        } else {
          text += "'";
          this.pos += 1;
        }
      } else if (c === "#" && inPlural) {
        flush();
        out.push({ kind: "arg", name: "#" });
        this.pos += 1;
      } else if (c === "{") {
        flush();
        out.push(this.argument());
      } else if (c === "}") {
        break;
      } else {
        text += c;
        this.pos += 1;
      }
    }
    flush();
    return out;
  }

  private argument(): Node {
    this.pos += 1; // {
    const name = this.word();
    this.skip();
    if (this.s[this.pos] === "}") {
      this.pos += 1;
      return { kind: "arg", name };
    }
    if (this.s[this.pos] !== ",") throw new Error(`light: bad argument "${name}"`);
    this.pos += 1;
    this.skip();
    const type = this.word();
    this.skip();
    if (type !== "plural" && type !== "select")
      throw new Error(`light: unsupported argument type "${type}"`);
    if (this.s[this.pos] !== ",") throw new Error(`light: argument "${name}" needs a type`);
    this.pos += 1;
    this.skip();
    if (type === "plural") return this.plural(name);
    if (type === "select") return this.select(name);
    throw new Error(`light: unsupported argument type "${type}"`);
  }

  private plural(name: string): Node {
    const exact = new Map<number, Node[]>();
    const cases = new Map<string, Node[]>();
    while (this.pos < this.s.length && this.s[this.pos] !== "}") {
      this.skip();
      if (this.s[this.pos] === "=") {
        this.pos += 1;
        const n = Number(this.word());
        this.skip();
        exact.set(n, this.branch(true));
      } else {
        const key = this.word();
        if (key === "") throw new Error("light: empty plural case");
        this.skip();
        cases.set(key, this.branch(true));
      }
      this.skip();
    }
    this.pos += 1; // }
    return { kind: "plural", name, exact, cases };
  }

  private select(name: string): Node {
    const cases = new Map<string, Node[]>();
    while (this.pos < this.s.length && this.s[this.pos] !== "}") {
      this.skip();
      const key = this.word();
      if (key === "") throw new Error("light: empty select case");
      this.skip();
      cases.set(key, this.branch(false));
      this.skip();
    }
    this.pos += 1; // }
    return { kind: "select", name, cases };
  }

  private branch(inPlural: boolean): Node[] {
    if (this.s[this.pos] !== "{") throw new Error("light: expected {");
    this.pos += 1;
    const nodes = this.message(inPlural);
    if (this.s[this.pos] !== "}") throw new Error("light: unclosed branch");
    this.pos += 1;
    return nodes;
  }

  private word(): string {
    const start = this.pos;
    while (this.pos < this.s.length && /[^\s{},=]/.test(this.s[this.pos]!)) this.pos += 1;
    return this.s.slice(start, this.pos);
  }

  private skip() {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos]!)) this.pos += 1;
  }
}

/** Formats an ICU-style template with values, for the locale. Throws on a value it cannot place. */
export function formatLight(template: string, values: LightValues = {}, locale = "en"): string {
  return render(parse(template), values, locale, null);
}

function render(nodes: Node[], values: LightValues, locale: string, hash: number | null): string {
  let out = "";
  for (const node of nodes) {
    if (node.kind === "text") {
      out += node.value;
    } else if (node.kind === "arg") {
      if (node.name === "#") {
        if (hash === null) throw new Error("light: # outside plural");
        out += new Intl.NumberFormat(locale).format(hash);
      } else {
        out += display(valueOf(values, node.name), locale);
      }
    } else if (node.kind === "plural") {
      const n = Number(valueOf(values, node.name));
      const exact = node.exact.get(n);
      const category = new Intl.PluralRules(locale).select(n);
      const branch = exact ?? node.cases.get(category) ?? node.cases.get("other");
      if (!branch) throw new Error(`light: no plural case for ${node.name}`);
      out += render(branch, values, locale, n);
    } else {
      const key = String(valueOf(values, node.name));
      const branch = node.cases.get(key) ?? node.cases.get("other");
      if (!branch) throw new Error(`light: no select case for ${node.name}`);
      out += render(branch, values, locale, hash);
    }
  }
  return out;
}

function valueOf(values: LightValues, name: string): LightValue {
  if (!(name in values)) throw new Error(`light: missing value "${name}"`);
  return values[name];
}

function display(value: LightValue, locale: string): string {
  if (typeof value === "number") return new Intl.NumberFormat(locale).format(value);
  return value === null || value === undefined ? "" : String(value);
}
