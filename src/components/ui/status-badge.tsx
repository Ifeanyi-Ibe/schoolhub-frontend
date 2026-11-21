import { AlertIcon, CheckCircleIcon, InfoIcon, XCircleIcon, DashedCircleIcon } from "./icons";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONES: Record<StatusTone, { surface: string; icon: typeof InfoIcon }> = {
  success: { surface: "bg-success-surface text-success-foreground", icon: CheckCircleIcon },
  warning: { surface: "bg-warning-surface text-warning-foreground", icon: AlertIcon },
  danger: { surface: "bg-danger-surface text-danger-foreground", icon: XCircleIcon },
  info: { surface: "bg-info-surface text-info-foreground", icon: InfoIcon },
  neutral: { surface: "bg-neutral-surface text-neutral-foreground", icon: DashedCircleIcon },
};

export interface StatusBadgeProps {
  tone: StatusTone;
  /** Visible text. Always shown: status is never conveyed by colour alone (WCAG 1.4.1). */
  children: ReactNode;
  className?: string;
}

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  const { surface, icon: Icon } = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset ring-current/15",
        surface,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}
