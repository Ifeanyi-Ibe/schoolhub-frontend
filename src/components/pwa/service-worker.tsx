"use client";

import { lazy, Suspense, useEffect, useState } from "react";

// The update banner is a separate chunk, loaded only when an update is actually waiting.
const UpdatePrompt = lazy(() => import("./update-prompt"));

/**
 * Registers the service worker in production and offers an in-app update prompt when a new
 * version is waiting. The new worker does not take over until the user accepts (skipWaiting is
 * sent only on their request), so an open form is never reloaded underneath them.
 */
export function ServiceWorkerRegistrar() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let reg: ServiceWorkerRegistration | undefined;
    let cancelled = false;

    const onUpdateFound = () => {
      const installing = reg?.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller && !cancelled) {
          setWaiting(installing);
        }
      });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;
        reg = registration;
        if (registration.waiting && navigator.serviceWorker.controller)
          setWaiting(registration.waiting);
        registration.addEventListener("updatefound", onUpdateFound);
      })
      .catch(() => {
        // Registration can fail on insecure origins or in private modes. The app still works online.
      });

    return () => {
      cancelled = true;
      reg?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  if (!waiting) return null;
  return (
    <Suspense fallback={null}>
      <UpdatePrompt
        onAccept={() => {
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => window.location.reload(),
            { once: true },
          );
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
      />
    </Suspense>
  );
}
