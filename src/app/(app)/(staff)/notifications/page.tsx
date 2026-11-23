// Notification templates, the message log, statistics and the SMS wallet (ADR 0025). The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { NotificationsView } from "@/features/notifications/NotificationsView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function NotificationsPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <NotificationsView />
    </HydrationBoundary>
  );
}
