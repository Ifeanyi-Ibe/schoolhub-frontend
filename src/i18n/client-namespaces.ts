// Message namespaces read by client components, grouped by the layout that renders them. Each
// layout sends only what its subtree reads: the sign-in pages do not load account strings, and the
// signed-in pages do not load sign-in strings. Anything else stays on the server.
export const SHARED_NAMESPACES = ["common", "network", "pwa", "retry"] as const;
export const AUTH_NAMESPACES = ["auth", "retry"] as const;
export const APP_NAMESPACES = [
  "shell",
  "home",
  "profile",
  "sessions",
  "staff",
  "academics",
] as const;

export function pickNamespaces<T extends Record<string, unknown>>(
  messages: T,
  names: readonly string[],
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of names) {
    if (key in messages) out[key as keyof T] = messages[key as keyof T];
  }
  return out;
}

/** Everything a client component reads, sent once from the root layout (see ClientMessages note). */
export const ALL_CLIENT_NAMESPACES = [
  ...SHARED_NAMESPACES,
  ...AUTH_NAMESPACES,
  ...APP_NAMESPACES,
] as const;

/**
 * Message paths the light formatter serves to the parent portal and the shared components (see
 * src/i18n/light.ts). The root layout sends these and no others. Every message here is covered by the
 * parity test (src/i18n/light.test.ts), which compares the output with intl-messageformat.
 */
export const LIGHT_MESSAGE_PATHS = [
  "common",
  "network",
  "pwa",
  "retry",
  "shell",
  "home",
  "profile",
  "sessions",
  "auth",
  "palette",
  "wards",
] as const;

/** Keeps only the given dotted paths, nested as in the source (e.g. "auth.login" keeps auth.login). */
export function pickPaths(
  messages: Readonly<Record<string, unknown>>,
  paths: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const path of paths) {
    const parts = path.split(".");
    let source: unknown = messages;
    for (const part of parts) {
      if (typeof source !== "object" || source === null) {
        source = undefined;
        break;
      }
      source = (source as Record<string, unknown>)[part];
    }
    if (source === undefined) continue;
    let target = out;
    for (const part of parts.slice(0, -1)) {
      const next = (target[part] ?? {}) as Record<string, unknown>;
      target[part] = next;
      target = next;
    }
    target[parts[parts.length - 1]!] = source;
  }
  return out;
}
