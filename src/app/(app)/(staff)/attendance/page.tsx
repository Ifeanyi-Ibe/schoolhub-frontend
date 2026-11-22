// Attendance: the register for each assigned class arm. The signed-in user and the school are read on the server.
import { HydrationBoundary } from "@tanstack/react-query";
import { AttendanceHomeView } from "@/features/attendance/AttendanceHomeView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function AttendanceHomePage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <AttendanceHomeView />
    </HydrationBoundary>
  );
}
