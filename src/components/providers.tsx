"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker";
import { ToastProvider } from "@/components/ui/toast";

/** Client-side providers. Server data lives in TanStack Query; nothing sensitive is persisted. */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Read-mostly parent data is stale-while-revalidate in memory (brief: offline/PWA).
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        {children}
        <ServiceWorkerRegistrar />
      </ToastProvider>
    </QueryClientProvider>
  );
}
