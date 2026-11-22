// Fee setup: fee items, fee structures and discounts. The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { SetupView } from "@/features/fees/SetupView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function FeesSetupPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <SetupView />
    </HydrationBoundary>
  );
}
