// Grading schemes and their bands, read on the server with the signed-in user and the school.
import { HydrationBoundary } from "@tanstack/react-query";
import { GradingView } from "@/features/academics/GradingView";
import { gradingSchemesQuery } from "@/features/academics/catalogue-api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function GradingPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: gradingSchemesQuery.queryKey, path: "api/v1/grading-schemes" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <GradingView />
    </HydrationBoundary>
  );
}
