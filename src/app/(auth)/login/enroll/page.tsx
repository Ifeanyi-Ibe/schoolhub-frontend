import { getTranslations } from "next-intl/server";
import { EnrollForm } from "@/features/auth/forms";
import { getEnv } from "@/server/env";
import { safeReturnPath } from "@/server/return-path";

// Mandatory enrolment: the only screen an account with an enrolment challenge can reach.
export default async function EnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getTranslations("auth.enroll");
  const { next } = await searchParams;
  return (
    <section aria-labelledby="enroll-title" className="flex flex-col gap-6">
      <h1 id="enroll-title" className="font-display text-2xl font-semibold text-foreground">
        {t("title")}
      </h1>
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      <EnrollForm next={safeReturnPath(next, getEnv().APP_ORIGIN)} />
    </section>
  );
}
