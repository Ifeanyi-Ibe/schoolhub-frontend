// Validates the `next` parameter after sign-in. Only a same-origin, app-relative path is accepted.
// Anything else (protocol-relative, backslash tricks, schemes, control characters, API paths,
// or a path that would loop back into sign-in) falls back to the default.

export const DEFAULT_RETURN_PATH = "/home";
const MAX_LENGTH = 512;

export function safeReturnPath(
  raw: string | null | undefined,
  appOrigin: string,
  fallback = DEFAULT_RETURN_PATH,
): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f\s]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, appOrigin);
  } catch {
    return fallback;
  }
  if (url.origin !== new URL(appOrigin).origin) return fallback;
  if (url.pathname.startsWith("/api/") || url.pathname === "/api") return fallback;
  if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return fallback;
  return `${url.pathname}${url.search}`;
}
