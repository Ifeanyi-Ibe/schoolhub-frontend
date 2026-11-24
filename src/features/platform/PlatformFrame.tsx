"use client";

// The platform's providers and header, for platform pages only (ADR 0027). It is not a layout file: a route-group layout would be
// loaded by every route, and the school's routes must not pay for it.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { PlatformSignOut } from "./PlatformSignOut";

export function PlatformFrame({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="flex min-h-dvh flex-col bg-background">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <span className="font-display text-sm font-semibold text-foreground">
            SchoolHub platform
          </span>
          <PlatformSignOut />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </NextIntlClientProvider>
  );
}
