// A student's fee ledger: every debit and credit, with the balance after each line. The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { LedgerView } from "@/features/fees/LedgerView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function FeesLedgerPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <LedgerView />
    </HydrationBoundary>
  );
}
