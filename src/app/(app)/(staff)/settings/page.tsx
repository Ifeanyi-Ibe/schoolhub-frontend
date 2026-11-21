// School settings, read on the server with the signed-in user and the school (the three reads are typed).
import { HydrationBoundary } from "@tanstack/react-query";
import { SettingsView } from "@/features/settings/SettingsView";
import { brandingQuery, policiesQuery, schoolProfileQuery } from "@/features/settings/api";
import { meQuery, tenantQuery } from "@/features/shell/api";
import { prefetchSignedIn } from "@/server/prefetch";

export default async function SettingsPage() {
  const dehydrated = await prefetchSignedIn([
    { key: meQuery.queryKey, path: "api/v1/me" },
    { key: tenantQuery.queryKey, path: "api/v1/me/tenant" },
    { key: schoolProfileQuery.queryKey, path: "api/v1/settings/school-profile" },
    { key: brandingQuery.queryKey, path: "api/v1/settings/branding" },
    { key: policiesQuery.queryKey, path: "api/v1/settings/policies" },
  ]);
  return (
    <HydrationBoundary state={dehydrated}>
      <SettingsView />
    </HydrationBoundary>
  );
}
