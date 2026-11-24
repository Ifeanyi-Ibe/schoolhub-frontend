// Server wrapper for platform pages (ADR 0027): hands the frame the platform's own messages, in the one locale the app serves.
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { pickNamespaces } from "@/i18n/client-namespaces";
import { DEFAULT_LOCALE } from "@/i18n/request";
import { PlatformFrame } from "./PlatformFrame";

export async function PlatformPage({ children }: { children: ReactNode }) {
  const messages = pickNamespaces(await getMessages({ locale: DEFAULT_LOCALE }), ["platform"]);
  return (
    <PlatformFrame locale={DEFAULT_LOCALE} messages={messages}>
      {children}
    </PlatformFrame>
  );
}
