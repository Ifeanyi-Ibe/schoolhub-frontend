"use client";

import { useLightTranslations } from "@/i18n/light-provider";
import { Banner } from "./banner";

export default function OfflineBanner() {
  const t = useLightTranslations("network");
  return (
    <Banner tone="warning" title={t("offlineTitle")}>
      {t("offlineBody")}
    </Banner>
  );
}
