// One role, read on the server with the signed-in user, the roles and the permission catalogue.
import { HydrationBoundary } from "@tanstack/react-query";
import { RoleEditor } from "@/features/staff/RoleEditor";
import { permissionCatalogQuery, rolesQuery } from "@/features/staff/api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: rolesQuery.queryKey, path: "api/v1/roles" },
    { key: permissionCatalogQuery.queryKey, path: "api/v1/permissions" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <RoleEditor roleId={id} />
    </HydrationBoundary>
  );
}
