import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers } from "next/headers";
import { ALL_CLIENT_NAMESPACES, pickNamespaces } from "@/i18n/client-namespaces";
import Script from "next/script";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { OnlineIndicator } from "@/components/ui/offline-status";
import { inter, plusJakarta } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SchoolHub", template: "%s · SchoolHub" },
  description: "School management for parents, teachers and staff.",
  applicationName: "SchoolHub",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SchoolHub", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f5c4d" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers makes this layout dynamic, which the CSP nonce from src/proxy.ts needs.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const locale = await getLocale();
  // Only the namespaces that client components read are sent to the browser (the full catalogue is
  // used on the server). Keeps the first load within budget.
  const messages = pickNamespaces(await getMessages(), ALL_CLIENT_NAMESPACES);

  return (
    <html lang={locale} className={`${inter.variable} ${plusJakarta.variable}`}>
      <body className="min-h-dvh antialiased">
        {/* Feature detection before the app loads (ADR 0008). Carries the request nonce. */}
        <Script src="/browser-check.js" strategy="beforeInteractive" nonce={nonce} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <OnlineIndicator />
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
