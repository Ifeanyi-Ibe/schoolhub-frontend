"use client";

import * as RadixToast from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { StatusTone } from "./status-badge";
import type { ToastItemView } from "./toast-types";

const TONE_CLASS: Record<StatusTone, string> = {
  success: "border-success-foreground/30 bg-success-surface text-success-foreground",
  warning: "border-warning-foreground/30 bg-warning-surface text-warning-foreground",
  danger: "border-danger/40 bg-danger-surface text-danger-foreground",
  info: "border-info-foreground/30 bg-info-surface text-info-foreground",
  neutral: "border-border bg-surface text-foreground",
};

/**
 * The Radix toast region. Loaded on demand by ToastProvider, only while a toast is showing, so
 * the Radix toast code is not part of the first load.
 */
export default function ToastRegion({
  items,
  onDismiss,
}: {
  items: readonly ToastItemView[];
  onDismiss: (id: number) => void;
}) {
  const t = useTranslations("common");
  return (
    <RadixToast.Provider swipeDirection="right" duration={6000}>
      {items.map((item) => (
        <RadixToast.Root
          key={item.id}
          type={item.tone === "danger" ? "foreground" : "background"}
          onOpenChange={(open) => {
            if (!open) onDismiss(item.id);
          }}
          className={cn(
            "pointer-events-auto flex w-[min(92vw,24rem)] items-start gap-3 rounded-card border p-4 shadow-raised",
            TONE_CLASS[item.tone],
          )}
        >
          <div className="flex flex-1 flex-col gap-1">
            <RadixToast.Title className="text-sm font-semibold">{item.title}</RadixToast.Title>
            {item.description ? (
              <RadixToast.Description className="text-sm">
                {item.description}
              </RadixToast.Description>
            ) : null}
          </div>
          <RadixToast.Close
            aria-label={t("close")}
            className="-m-2 inline-flex size-11 items-center justify-center rounded-control hover:bg-muted/60"
          >
            <X className="size-4" aria-hidden="true" />
          </RadixToast.Close>
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 outline-none" />
    </RadixToast.Provider>
  );
}
