"use client";

import { useTranslations } from "next-intl";
import { Banner } from "./banner";

export default function OfflineBanner() {
  const t = useTranslations("network");
  return (
    <Banner tone="warning" title={t("offlineTitle")}>
      {t("offlineBody")}
    </Banner>
  );
}
