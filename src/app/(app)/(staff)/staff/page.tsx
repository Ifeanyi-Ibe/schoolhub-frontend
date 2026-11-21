// Staff: the list. The signed-in user, the school and the first page are read on the server; the search and
// filters are in the URL, so the list can be shared.
import { HydrationBoundary } from "@tanstack/react-query";
import { StaffListView } from "@/features/staff-members/StaffListView";
import { parseStaffPage } from "@/features/staff-members/page-params";
import { staffListQuery } from "@/features/staff-members/api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseStaffPage(await searchParams);
  const list = staffListQuery(state);
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    {
      key: list.queryKey,
      path: "api/v1/staff",
      query: {
        ...(state.q !== "" ? { q: state.q } : {}),
        ...(state.staffType !== "" ? { staffType: state.staffType } : {}),
        ...(state.status !== "" ? { status: state.status } : {}),
        page: state.page,
        pageSize: 20,
      },
    },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <StaffListView />
    </HydrationBoundary>
  );
}
