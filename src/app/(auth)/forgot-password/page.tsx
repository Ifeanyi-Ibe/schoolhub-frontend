import { getTranslations } from "next-intl/server";
import { ForgotForm } from "@/features/auth/forms";

export default async function ForgotPage() {
  const t = await getTranslations("auth.forgot");
  return (
    <section aria-labelledby="forgot-title" className="flex flex-col gap-6">
      <h1 id="forgot-title" className="font-display text-2xl font-semibold text-foreground">
        {t("title")}
      </h1>
      <ForgotForm />
    </section>
  );
}
