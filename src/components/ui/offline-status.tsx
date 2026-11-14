"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";

// The banner is loaded only while offline.
const OfflineBanner = lazy(() => import("./offline-banner"));

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** True when the browser reports a connection. Server render assumes online. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** Persistent offline notice. Writes that need the network say so where they are made. */
export function OnlineIndicator() {
  const online = useOnline();
  return online ? null : (
    <Suspense fallback={null}>
      <OfflineBanner />
    </Suspense>
  );
}
