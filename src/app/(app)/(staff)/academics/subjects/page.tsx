// Subjects and class-level mappings, read on the server with the signed-in user and the school.
import { HydrationBoundary } from "@tanstack/react-query";
import { SubjectsView } from "@/features/academics/SubjectsView";
import { levelsQuery } from "@/features/academics/api";
import { subjectsQuery } from "@/features/academics/catalogue-api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function SubjectsPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: subjectsQuery.queryKey, path: "api/v1/subjects" },
    { key: levelsQuery.queryKey, path: "api/v1/class-levels" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <SubjectsView />
    </HydrationBoundary>
  );
}
