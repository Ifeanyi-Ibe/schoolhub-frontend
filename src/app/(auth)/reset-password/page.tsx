import { getTranslations } from "next-intl/server";
import { ResetForm } from "@/features/auth/forms";

// The reset token is read from the URL fragment in the browser; it is never sent to the server.
export default async function ResetPage() {
  const t = await getTranslations("auth.reset");
  return (
    <section aria-labelledby="reset-title" className="flex flex-col gap-6">
      <h1 id="reset-title" className="font-display text-2xl font-semibold text-foreground">
        {t("title")}
      </h1>
      <ResetForm />
    </section>
  );
}
