// Staff accounts. The first HTML already holds the signed-in user, the school, and the first page of
// the list (no client waterfall). Visibility and actions are still decided on the client, from the
// effective permissions in GET /me (UX only; the API decides).
import { HydrationBoundary } from "@tanstack/react-query";
import { PeopleView } from "@/features/staff/PeopleView";
import { peopleQuery } from "@/features/staff/api";
import { parsePeopleQuery } from "@/features/staff/rules";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchedData, prefetchSignedIn } from "@/server/prefetch";
import type { components } from "@/lib/api/schema";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") params.set(k, v);
  const state = parsePeopleQuery(params);
  const list = peopleQuery(state);
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    {
      key: list.queryKey,
      path: "api/v1/users",
      query: { ...(state.q !== "" ? { q: state.q } : {}), page: state.page, pageSize: 20 },
    },
  ]);
  // The account and the first page are passed as props too, so the server HTML holds the content (not only the
  // serialized cache). The cache keeps them current after hydration.
  return (
    <HydrationBoundary state={dehydrated}>
      <PeopleView
        initialMe={prefetchedData<components["schemas"]["MeView"]>(dehydrated, meQuery.queryKey)}
        initialList={prefetchedData<components["schemas"]["PagedResultOfUserView"]>(
          dehydrated,
          list.queryKey,
        )}
      />
    </HydrationBoundary>
  );
}
