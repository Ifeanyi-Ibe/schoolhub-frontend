// Students: the list. The signed-in user and the school are read on the server with the first page; the search
// and filters are in the URL, so the list can be shared.
import { HydrationBoundary } from "@tanstack/react-query";
import { StudentsView } from "@/features/students/StudentsView";
import { parseStudentsPage, studentsPageParams } from "@/features/students/page-params";
import { studentsQuery } from "@/features/students/api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseStudentsPage(await searchParams);
  const list = studentsQuery(state);
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: list.queryKey, path: "api/v1/students", query: studentsPageParams(state) },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <StudentsView />
    </HydrationBoundary>
  );
}
