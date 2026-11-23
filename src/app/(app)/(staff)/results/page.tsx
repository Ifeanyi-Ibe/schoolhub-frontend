// The class broadsheet, the computation of results, and each student's domains and remarks (ADR 0024). The signed-in user and
// the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { ResultsView } from "@/features/assessment/ResultsView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function ResultsPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <ResultsView />
    </HydrationBoundary>
  );
}
