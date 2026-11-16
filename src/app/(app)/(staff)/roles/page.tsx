// Roles and their permissions, read on the server with the signed-in user (see people/page.tsx).
import { HydrationBoundary } from "@tanstack/react-query";
import { RolesView } from "@/features/staff/RolesView";
import { rolesQuery } from "@/features/staff/api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function RolesPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: rolesQuery.queryKey, path: "api/v1/roles" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <RolesView />
    </HydrationBoundary>
  );
}
