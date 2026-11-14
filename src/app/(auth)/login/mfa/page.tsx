import { getTranslations } from "next-intl/server";
import { MfaForm } from "@/features/auth/forms";
import { getEnv } from "@/server/env";
import { safeReturnPath } from "@/server/return-path";

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getTranslations("auth.mfa");
  const { next } = await searchParams;
  return (
    <section aria-labelledby="mfa-title" className="flex flex-col gap-6">
      <h1 id="mfa-title" className="font-display text-2xl font-semibold text-foreground">
        {t("title")}
      </h1>
      <MfaForm next={safeReturnPath(next, getEnv().APP_ORIGIN)} />
    </section>
  );
}
