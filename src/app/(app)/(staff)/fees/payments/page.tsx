// Payments: record payments made at the school, reversal requests and approvals, and unallocated money. The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { PaymentsView } from "@/features/fees/PaymentsView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function FeesPaymentsPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <PaymentsView />
    </HydrationBoundary>
  );
}
