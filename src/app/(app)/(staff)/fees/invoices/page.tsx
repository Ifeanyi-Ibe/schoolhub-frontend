// Invoices: generate a term's invoices, find them, void or adjust one, and download its PDF. The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { InvoicesView } from "@/features/fees/InvoicesView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function FeesInvoicesPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <InvoicesView />
    </HydrationBoundary>
  );
}
