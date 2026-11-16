"use client";

import { useLightTranslations } from "@/i18n/light-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";

/**
 * Shown only when a new service worker is waiting. Loaded on demand (see service-worker.tsx), so
 * the banner and button code is not part of the first load for everyone else.
 */
export default function UpdatePrompt({ onAccept }: { onAccept: () => void }) {
  const t = useLightTranslations("pwa");
  return (
    <Banner
      tone="info"
      title={t("updateTitle")}
      action={
        <Button variant="primary" onClick={onAccept}>
          {t("updateAction")}
        </Button>
      }
    >
      <p>{t("updateBody")}</p>
    </Banner>
  );
}
