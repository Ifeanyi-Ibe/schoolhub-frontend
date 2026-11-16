"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatLight, type LightValues } from "./light";

interface Catalogue {
  locale: string;
  messages: Readonly<Record<string, unknown>>;
}

const LightContext = createContext<Catalogue | null>(null);

/**
 * Carries the parent-portal and shared messages from the root layout. Only the paths in
 * LIGHT_MESSAGE_PATHS are sent (see client-namespaces.ts); the full catalogue stays on the server.
 */
export function LightMessagesProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: Readonly<Record<string, unknown>>;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <LightContext.Provider value={value}>{children}</LightContext.Provider>;
}

/**
 * Same call shape as next-intl's useTranslations: t("key") or t("key", values), relative to a namespace.
 * A missing key returns the full key path rather than throwing, so a missing string never blanks a screen
 * (the parity and key tests catch it before it ships).
 */
export function useLightTranslations(namespace: string) {
  const catalogue = useContext(LightContext);
  if (catalogue === null) {
    throw new Error(
      "useLightTranslations needs LightMessagesProvider (rendered by the root layout).",
    );
  }
  return useMemo(() => {
    return (key: string, values?: LightValues): string => {
      const path = `${namespace}.${key}`;
      const template = lookup(catalogue.messages, path);
      if (typeof template !== "string") return path;
      return formatLight(template, values, catalogue.locale);
    };
  }, [catalogue, namespace]);
}

function lookup(source: Readonly<Record<string, unknown>>, path: string): unknown {
  let node: unknown = source;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}
