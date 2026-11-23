// The staff inbox and notification preferences (ADR 0025). The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { InboxView } from "@/features/inbox/InboxView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function InboxPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <InboxView />
    </HydrationBoundary>
  );
}
