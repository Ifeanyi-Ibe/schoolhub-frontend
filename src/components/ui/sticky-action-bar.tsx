import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Sticky footer for long forms. Stays above the home indicator on phones (safe-area inset).
 * The region is labelled so screen-reader users can find the form's actions.
 */
export function StickyActionBar({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      className={cn(
        "sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-surface/95 px-4 pt-3 backdrop-blur sm:flex-row sm:justify-end sm:-mx-6 sm:px-6",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </div>
  );
}
