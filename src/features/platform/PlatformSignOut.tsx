"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { platformSignOut } from "./api";

/** Ends the platform session: only the platform cookies are cleared (ADR 0027). */
export function PlatformSignOut() {
  const t = useTranslations("platform.signOut");
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        await platformSignOut();
        router.replace("/platform/sign-in");
      }}
    >
      {t("action")}
    </Button>
  );
}
