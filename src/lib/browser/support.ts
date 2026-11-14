// Browser feature detection (ADR 0008). Floor: Chrome/Edge 111+, Firefox 111+, Safari 16.4+.
// No polyfills: a browser that fails a check is sent to the static unsupported page instead.
//
// public/browser-check.js carries a copy of SUPPORT_CHECKS (it runs before the app bundle). A test
// keeps the two identical, so the list cannot drift.

export type SupportCheck =
  | { id: string; kind: "decl"; prop: string; value: string }
  | { id: string; kind: "selector"; text: string }
  | { id: string; kind: "api"; name: string };

export const SUPPORT_CHECKS: readonly SupportCheck[] = [
  { id: "oklch", kind: "decl", prop: "color", value: "oklch(0.5 0.1 200)" },
  { id: "color-mix", kind: "decl", prop: "color", value: "color-mix(in srgb, #000 50%, #fff)" },
  { id: "where", kind: "selector", text: ":where(a)" },
  { id: "register-property", kind: "api", name: "CSS.registerProperty" },
  { id: "readable-stream", kind: "api", name: "ReadableStream" },
];

/** What the browser answers. Injected so the logic can be tested without a browser. */
export interface SupportEnv {
  declSupported(prop: string, value: string): boolean;
  selectorSupported(text: string): boolean;
  apiPresent(name: string): boolean;
}

/** Ids of the checks this browser fails. Empty means supported. */
export function failedChecks(
  env: SupportEnv,
  checks: readonly SupportCheck[] = SUPPORT_CHECKS,
): string[] {
  return checks
    .filter((c) => {
      if (c.kind === "decl") return !env.declSupported(c.prop, c.value);
      if (c.kind === "selector") return !env.selectorSupported(c.text);
      return !env.apiPresent(c.name);
    })
    .map((c) => c.id);
}

export function isSupported(env: SupportEnv): boolean {
  return failedChecks(env).length === 0;
}

/** The real browser, read through the CSS and global APIs. Any throw counts as unsupported. */
export function browserSupportEnv(win: Window = window): SupportEnv {
  const css = (
    win as unknown as {
      CSS?: { supports?: (...a: string[]) => boolean; registerProperty?: unknown };
    }
  ).CSS;
  const has = (name: string): boolean => {
    if (name === "CSS.registerProperty") return typeof css?.registerProperty === "function";
    return typeof (win as unknown as Record<string, unknown>)[name] !== "undefined";
  };
  return {
    declSupported: (prop, value) => {
      try {
        return Boolean(css?.supports?.(prop, value));
      } catch {
        return false;
      }
    },
    selectorSupported: (text) => {
      try {
        return Boolean(css?.supports?.(`selector(${text})`));
      } catch {
        return false;
      }
    },
    apiPresent: has,
  };
}
