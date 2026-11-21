// Staff screens (people, roles, academics) use the full next-intl formatter, so their subtree gets the
// provider and only its own namespaces. The parent portal does not (see src/i18n/light.ts, ADR 0013).
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { pickNamespaces } from "@/i18n/client-namespaces";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = pickNamespaces(await getMessages(), [
    "staff",
    "academics",
    "settings",
    "students",
  ]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
