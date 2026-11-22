// Where the card payment's gateway returns the parent. The result is verified with the server, never taken from the redirect.
import { HydrationBoundary } from "@tanstack/react-query";
import { PaymentReturnView } from "@/features/wards/ReturnView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function WardPaymentReturnPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <PaymentReturnView />
    </HydrationBoundary>
  );
}
