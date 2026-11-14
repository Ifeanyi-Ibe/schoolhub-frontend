"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ToastInput, ToastItemView } from "./toast-types";

export type { ToastInput } from "./toast-types";

type ToastFn = (input: ToastInput) => void;

const ToastContext = createContext<ToastFn | null>(null);

// The Radix toast region is loaded only while a toast is showing (keeps the first load small).
const ToastRegion = dynamic(() => import("./toast-region"), { ssr: false });

let toastSeq = 0;

/**
 * Toast outcomes. Radix announces them through a live region; danger toasts are assertive.
 * Long-lived problems belong in a Banner or ErrorState, not a toast.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItemView[]>([]);

  const toast = useCallback<ToastFn>((input) => {
    toastSeq += 1;
    const id = toastSeq;
    setItems((prev) => [...prev.slice(-2), { ...input, id }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {items.length > 0 ? <ToastRegion items={items} onDismiss={dismiss} /> : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
