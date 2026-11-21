// School years (sessions), their terms and school days, read on the server with the signed-in user and the
// school. Terms and school days are read on the screen when a session or term is opened.
import { HydrationBoundary } from "@tanstack/react-query";
import { SessionsView } from "@/features/academics/SessionsView";
import { academicSessionsQuery } from "@/features/academics/sessions-api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function SessionsPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: academicSessionsQuery.queryKey, path: "api/v1/sessions" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <SessionsView />
    </HydrationBoundary>
  );
}
