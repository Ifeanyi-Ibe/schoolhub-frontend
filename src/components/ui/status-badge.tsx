import { AlertTriangle, CheckCircle2, CircleDashed, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONES: Record<StatusTone, { surface: string; icon: typeof Info }> = {
  success: { surface: "bg-success-surface text-success-foreground", icon: CheckCircle2 },
  warning: { surface: "bg-warning-surface text-warning-foreground", icon: AlertTriangle },
  danger: { surface: "bg-danger-surface text-danger-foreground", icon: XCircle },
  info: { surface: "bg-info-surface text-info-foreground", icon: Info },
  neutral: { surface: "bg-neutral-surface text-neutral-foreground", icon: CircleDashed },
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
        surface,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}
