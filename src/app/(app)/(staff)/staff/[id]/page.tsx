// One staff record. The record is read on the server with the signed-in user and the school.
import { HydrationBoundary } from "@tanstack/react-query";
import { StaffProfileView } from "@/features/staff-members/StaffProfileView";
import { staffQuery } from "@/features/staff-members/api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function StaffRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: staffQuery(id).queryKey, path: `api/v1/staff/${encodeURIComponent(id)}` },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <StaffProfileView id={id} />
    </HydrationBoundary>
  );
}
