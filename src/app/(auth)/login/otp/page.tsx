import { getTranslations } from "next-intl/server";
import { OtpForm } from "@/features/auth/forms";
import { getEnv } from "@/server/env";
import { safeReturnPath } from "@/server/return-path";

export default async function OtpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getTranslations("auth.otp");
  const { next } = await searchParams;
  return (
    <section aria-labelledby="otp-title" className="flex flex-col gap-6">
      <h1 id="otp-title" className="font-display text-2xl font-semibold text-foreground">
        {t("title")}
      </h1>
      <OtpForm next={safeReturnPath(next, getEnv().APP_ORIGIN)} />
    </section>
  );
}
