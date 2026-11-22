// Fees overview: collection, debtors and reconciliation, as the server computes them. The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { FeesReportsView } from "@/features/fees/ReportsView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function FeesReportsPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <FeesReportsView />
    </HydrationBoundary>
  );
}
