"use client";

import type { ReactNode } from "react";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Providers for every page (sign-in included). Server data lives in the query provider of the
 * signed-in area (src/features/shell/query-provider.tsx), so the sign-in page does not load it.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ServiceWorkerRegistrar />
    </ToastProvider>
  );
}
