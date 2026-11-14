// Class levels, read on the server with the signed-in user and the school (see people/page.tsx).
import { HydrationBoundary } from "@tanstack/react-query";
import { LevelsView } from "@/features/academics/LevelsView";
import { levelsQuery } from "@/features/academics/api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function LevelsPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: levelsQuery.queryKey, path: "api/v1/class-levels" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <LevelsView />
    </HydrationBoundary>
  );
}
