import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers } from "next/headers";
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
  await headers();
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${inter.variable} ${plusJakarta.variable}`}>
      <body className="min-h-dvh antialiased">
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
