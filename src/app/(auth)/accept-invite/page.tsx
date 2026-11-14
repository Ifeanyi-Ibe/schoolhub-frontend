import { getTranslations } from "next-intl/server";
import { InviteForm } from "@/features/auth/forms";

// The invitation token is read from the URL fragment in the browser; it is never sent to the server.
export default async function InvitePage() {
  const t = await getTranslations("auth.invite");
  return (
    <section aria-labelledby="invite-title" className="flex flex-col gap-6">
      <h1 id="invite-title" className="font-display text-2xl font-semibold text-foreground">
        {t("title")}
      </h1>
      <InviteForm />
    </section>
  );
}
