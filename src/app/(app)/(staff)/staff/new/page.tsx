// Staff: create a record. The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { StaffNewView } from "@/features/staff-members/StaffNewView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function StaffNewPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <StaffNewView />
    </HydrationBoundary>
  );
}
