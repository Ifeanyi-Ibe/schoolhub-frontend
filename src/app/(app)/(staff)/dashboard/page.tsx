// The school's dashboard for the current term (ADR 0025). The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { AdminDashboardView } from "@/features/dashboard/AdminDashboardView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function DashboardPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <AdminDashboardView />
    </HydrationBoundary>
  );
}
