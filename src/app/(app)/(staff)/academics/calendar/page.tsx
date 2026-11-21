// The academic calendar. The range is chosen on the screen, so the days load there (not on the server).
import { HydrationBoundary } from "@tanstack/react-query";
import { CalendarView } from "@/features/academics/CalendarView";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function CalendarPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <CalendarView />
    </HydrationBoundary>
  );
}
