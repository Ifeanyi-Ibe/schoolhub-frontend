// Attendance reports for the teacher's own classes: absentees, class and term summaries, and the term export.
import { HydrationBoundary } from "@tanstack/react-query";
import { ReportsView } from "@/features/attendance/ReportsView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function AttendanceReportsPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <ReportsView />
    </HydrationBoundary>
  );
}
