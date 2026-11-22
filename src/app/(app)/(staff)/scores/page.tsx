// Score sheets for the classes and subjects the signed-in user teaches (ADR 0022). The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { ScoresView } from "@/features/assessment/ScoresView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function ScoresPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <ScoresView />
    </HydrationBoundary>
  );
}
