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
