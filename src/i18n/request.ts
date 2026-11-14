// next-intl request config. English only for now; strings still live in messages/ so that
// adding a locale is a catalog change, not a component change (brief: i18n-ready).
import { getRequestConfig } from "next-intl/server";

export const DEFAULT_LOCALE = "en-NG";

export default getRequestConfig(async () => {
  const messages = (await import("../../messages/en.json")).default;
  return { locale: DEFAULT_LOCALE, messages };
});
