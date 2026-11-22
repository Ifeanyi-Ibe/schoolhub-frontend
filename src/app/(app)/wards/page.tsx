// Your children: the wards linked to this account. The signed-in user and the school are read on the server, with the list.
import { HydrationBoundary } from "@tanstack/react-query";
import { WardsListView } from "@/features/wards/WardViews";
import { wardsQuery } from "@/features/wards/api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function WardsPage() {
  const wards = wardsQuery();
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: wards.queryKey, path: "api/v1/me/wards" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <WardsListView />
    </HydrationBoundary>
  );
}
