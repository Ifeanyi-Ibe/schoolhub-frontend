import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { getEnv } from "@/server/env";
import { resolveTenant } from "@/server/tenant";

export default async function HomePage() {
  const t = await getTranslations("common");
  const env = getEnv();
  const h = await headers();
  const tenant = resolveTenant({
    hostHeader: h.get("host"),
    baseDomain: env.APP_BASE_DOMAIN,
    devFallbackSlug: env.DEV_TENANT_SLUG,
    isProduction: env.NODE_ENV === "production",
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-foreground">SchoolHub</h1>
      {tenant ? (
        <p className="text-base text-muted-foreground">
          Signing in to <span className="font-semibold text-foreground">{tenant.slug}</span> is
          available in the next release.
        </p>
      ) : (
        <p className="text-base text-muted-foreground">
          Open your school&apos;s own address to continue. Each school has its own web address.
        </p>
      )}
      <p className="text-sm text-muted-foreground">{t("emptyTitle")}</p>
    </main>
  );
}
