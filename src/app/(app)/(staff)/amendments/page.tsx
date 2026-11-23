// Amendments to a published result: request a change, and approve or reject one by its reference (ADR 0024).
import { HydrationBoundary } from "@tanstack/react-query";
import { AmendmentsView } from "@/features/assessment/AmendmentsView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function AmendmentsPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <AmendmentsView />
    </HydrationBoundary>
  );
}
