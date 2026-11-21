// Server-side data for signed-in screens. The page's primary reads run on the server, in parallel, and
// travel in the first HTML as dehydrated TanStack Query state. Nothing waits for the browser to ask.
//
// Rules:
// - The server never refreshes a session (cookies cannot be written from a server component). An
//   access token near expiry is not used here; the page then loads on the client, which refreshes
//   through the BFF as before.
// - A read that fails is simply not hydrated, and the client fetches it as it always did.
// - Keys and paths are the same ones the client uses, so the hydrated data is the data the client
//   would have asked for.
// - Client permission checks stay UX only. The server returns what the token may read, and a 403 is
//   not hydrated.

import { headers } from "next/headers";
import type { QueryKey } from "@tanstack/react-query";
import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import { accessTokenNeedsRefresh, cookieNames, parseCookieHeader } from "./session";
import { createBffDeps } from "./deps";
import { getEnv } from "./env";
import { isSecureOrigin, tenantFor } from "./bff-proxy";

export interface PrefetchRead {
  key: QueryKey;
  /** Path under the API, for example `api/v1/me`. */
  path: string;
  /** Query parameters, in the order the client sends them. */
  query?: Record<string, string | number>;
}

const PREFETCH_TIMEOUT_MS = 4_000;

/** Reads the listed queries on the server, in parallel, and returns them dehydrated for the client. */
export async function prefetchSignedIn(reads: readonly PrefetchRead[]): Promise<DehydratedState> {
  const env = getEnv();
  const deps = createBffDeps();
  const h = await headers();
  const jar = parseCookieHeader(h.get("cookie"));
  const names = cookieNames(isSecureOrigin(env.APP_ORIGIN));
  const accessToken = jar[names.access];
  const client = new QueryClient();
  // No usable token: nothing to read here. The client loads the data and refreshes the session itself.
  if (!accessToken || accessTokenNeedsRefresh(accessToken, deps.now())) return dehydrate(client);

  const tenantSlug = tenantFor(deps, new Request("http://internal/", { headers: h }));
  if (tenantSlug === null) return dehydrate(client);

  await Promise.all(
    reads.map((read) =>
      client.prefetchQuery({
        queryKey: read.key,
        queryFn: async () => {
          const search = read.query
            ? `?${new URLSearchParams(
                Object.entries(read.query).map(([k, v]) => [k, String(v)]),
              ).toString()}`
            : "";
          const upstream = await deps.api.call({
            method: "GET",
            path: read.path,
            search,
            inbound: new Headers(),
            accessToken,
            tenantSlug,
            clientIp: null,
            timeoutMs: PREFETCH_TIMEOUT_MS,
          });
          if (!upstream.ok) throw new Error(`prefetch ${read.path} answered ${upstream.status}`);
          return upstream.json();
        },
      }),
    ),
  );
  return dehydrate(client);
}

/**
 * The data of one prefetched query, for a Server Component to pass to a client component as a prop. Using
 * it as initialData renders the content in the server HTML (the cache alone did not; see docs/OPEN_ITEMS.md,
 * the LCP investigation).
 */
export function prefetchedData<T>(
  state: DehydratedState,
  queryKey: readonly unknown[],
): T | undefined {
  const wanted = JSON.stringify(queryKey);
  const hit = state.queries.find((q) => JSON.stringify(q.queryKey) === wanted);
  return hit?.state.data as T | undefined;
}
