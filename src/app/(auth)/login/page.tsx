import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/features/auth/forms";
import { getEnv } from "@/server/env";
import { safeReturnPath } from "@/server/return-path";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getTranslations("auth.login");
  const { next } = await searchParams;
  const safe = safeReturnPath(next, getEnv().APP_ORIGIN);
  return (
    <section aria-labelledby="login-title" className="flex flex-col gap-6">
      <h1 id="login-title" className="font-display text-2xl font-semibold text-foreground">
        {t("title")}
      </h1>
      <LoginForm next={safe} />
    </section>
  );
}
