// My classes: the signed-in teacher's own assignments. The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { MyClassesView } from "@/features/staff-members/MyClassesView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function MyClassesPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <MyClassesView />
    </HydrationBoundary>
  );
}
