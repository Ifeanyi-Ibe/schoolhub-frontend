// One student. The record is read on the server with the signed-in user and the school.
import { HydrationBoundary } from "@tanstack/react-query";
import { StudentProfileView } from "@/features/students/StudentProfileView";
import { studentQuery } from "@/features/students/api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: studentQuery(id).queryKey, path: `api/v1/students/${encodeURIComponent(id)}` },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <StudentProfileView id={id} />
    </HydrationBoundary>
  );
}
