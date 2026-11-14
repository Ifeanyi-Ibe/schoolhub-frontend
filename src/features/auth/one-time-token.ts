// The one-time token of an invitation or reset link (B-18).
//
// Preferred form: the token in the URL fragment (`accept-invite#token=…`). The browser never sends a
// fragment to the server. Interim form: the query string (`accept-invite?school=…&token=…`), which the
// backend currently emits. A query token does reach the server on the first request, so it is accepted
// only as a fallback, and it is removed from the address bar before anything else happens. Remove the
// query form when the backend emits fragment links (BACKEND_GAPS B-18).

export const TOKEN_KEY = "token";

export interface OneTimeToken {
  /** The token, or "" when the link carries none. */
  token: string;
  /** Where the token came from. */
  source: "fragment" | "query" | "none";
  /** The address with the token removed, or null when there was nothing to remove. */
  cleanHref: string | null;
}

/** Reads the token from a link and returns the same link without it. The fragment wins over the query. */
export function extractOneTimeToken(href: string): OneTimeToken {
  const url = new URL(href);

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const fromFragment = hashParams.get(TOKEN_KEY);
  if (fromFragment) {
    hashParams.delete(TOKEN_KEY);
    const rest = hashParams.toString();
    url.hash = rest;
    // The query may also carry the token (an old link); remove it too so no copy stays in the address bar.
    url.searchParams.delete(TOKEN_KEY);
    return { token: fromFragment, source: "fragment", cleanHref: url.href };
  }

  const fromQuery = url.searchParams.get(TOKEN_KEY);
  if (fromQuery) {
    url.searchParams.delete(TOKEN_KEY);
    return { token: fromQuery, source: "query", cleanHref: url.href };
  }

  return { token: "", source: "none", cleanHref: null };
}
