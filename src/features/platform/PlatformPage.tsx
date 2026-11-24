// Server wrapper for platform pages (ADR 0027): reads the locale and the platform's own messages, and hands them to the frame.
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { pickNamespaces } from "@/i18n/client-namespaces";
import { PlatformFrame } from "./PlatformFrame";

export async function PlatformPage({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = pickNamespaces(await getMessages(), ["platform"]);
  return (
    <PlatformFrame locale={locale} messages={messages}>
      {children}
    </PlatformFrame>
  );
}
