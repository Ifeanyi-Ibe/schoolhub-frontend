// Protected area. The server checks only that a session cookie is present; it never refreshes
// tokens here, because a server component cannot set cookies. The shell asks the BFF for the
// user (which refreshes if needed) and sends the user to sign-in if the session has ended.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/features/shell/AppShell";
import { QueryProvider } from "@/features/shell/query-provider";
import { cookieNames } from "@/server/session";
import { getEnv } from "@/server/env";
import { safeReturnPath } from "@/server/return-path";
import { createBffDeps } from "@/server/deps";
import { loadBranding } from "@/server/branding";
import { resolveTenant } from "@/server/tenant";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const env = getEnv();
  const names = cookieNames(new URL(env.APP_ORIGIN).protocol === "https:");
  const jar = await cookies();
  const signedIn = Boolean(jar.get(names.access)?.value || jar.get(names.refresh)?.value);
  if (!signedIn) {
    if (jar.get(names.enrollment)?.value) redirect("/login/enroll");
    if (jar.get(names.mfa)?.value) redirect("/login/mfa");
    const next = safeReturnPath((await headers()).get("x-pathname"), env.APP_ORIGIN);
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  // The school's name comes from the server (public branding by host), so it is in the first HTML.
  const h = await headers();
  const tenant = resolveTenant({
    hostHeader: h.get("host"),
    baseDomain: env.APP_BASE_DOMAIN,
    devFallbackSlug: env.DEV_TENANT_SLUG,
    isProduction: env.NODE_ENV === "production",
  });
  const branding = tenant ? await loadBranding(createBffDeps(), tenant.slug) : null;
  const schoolName = branding?.status === "ok" ? branding.branding.name : null;
  return (
    <QueryProvider>
      <AppShell schoolName={schoolName}>{children}</AppShell>
    </QueryProvider>
  );
}
