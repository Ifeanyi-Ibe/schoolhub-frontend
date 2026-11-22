// Attendance register: one class arm, one day. Marks can be taken offline and are sent when the connection returns.
import { HydrationBoundary } from "@tanstack/react-query";
import { RegisterView } from "@/features/attendance/RegisterView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function AttendanceRegisterPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <RegisterView />
    </HydrationBoundary>
  );
}
