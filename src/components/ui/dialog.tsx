"use client";

import { XIcon } from "./icons";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useLightTranslations } from "@/i18n/light-provider";
import { useLayoutEffect, useRef, type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Footer actions. Put the confirming action last and the safe action first. */
  footer?: ReactNode;
}

/**
 * Modal dialog with focus trap, focus return, Escape to close, and a labelled close button.
 * Radix handles focus management; we supply the labels.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer }: DialogProps) {
  const t = useLightTranslations("common");
  // Radix returns focus to its Trigger; we have none (the caller owns the button), so remember the
  // element focused before opening. A layout effect runs before Radix moves focus into the dialog.
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open)
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 motion-safe:animate-in motion-safe:fade-in-0" />
        <RadixDialog.Content
          onCloseAutoFocus={(event) => {
            const el = returnFocus.current;
            if (el && el.isConnected) {
              event.preventDefault();
              el.focus();
            }
          }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col gap-4 overflow-y-auto rounded-t-card bg-surface-raised p-6 shadow-raised sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <RadixDialog.Title className="font-display text-lg font-semibold text-foreground">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="text-sm text-muted-foreground">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close
              aria-label={t("close")}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-control hover:bg-muted"
            >
              <XIcon className="size-5" aria-hidden="true" />
            </RadixDialog.Close>
          </div>
          {children}
          {footer ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
