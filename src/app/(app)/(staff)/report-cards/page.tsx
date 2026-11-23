// Report cards for a class: generate, list, download and publish (ADR 0024). The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { ReportCardsView } from "@/features/assessment/ReportCardsView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function ReportCardsPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <ReportCardsView />
    </HydrationBoundary>
  );
}
