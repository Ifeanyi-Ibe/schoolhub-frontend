// One ward: their invoices, a card payment, and the school's contact for a transfer.
import { HydrationBoundary } from "@tanstack/react-query";
import { WardDetailView } from "@/features/wards/WardDetailView";
import { wardQuery } from "@/features/wards/api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function WardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: wardQuery(id).queryKey, path: `api/v1/me/wards/${encodeURIComponent(id)}` },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <WardDetailView id={id} />
    </HydrationBoundary>
  );
}
