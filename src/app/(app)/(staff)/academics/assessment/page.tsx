// Assessment schemes and their components, read on the server with the signed-in user and the school.
import { HydrationBoundary } from "@tanstack/react-query";
import { AssessmentView } from "@/features/academics/AssessmentView";
import { assessmentSchemesQuery } from "@/features/academics/catalogue-api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function AssessmentPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: assessmentSchemesQuery.queryKey, path: "api/v1/assessment-schemes" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <AssessmentView />
    </HydrationBoundary>
  );
}
