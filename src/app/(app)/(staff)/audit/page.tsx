// The audit log and its export (ADR 0025). The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { AuditView } from "@/features/audit/AuditView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function AuditPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <AuditView />
    </HydrationBoundary>
  );
}
