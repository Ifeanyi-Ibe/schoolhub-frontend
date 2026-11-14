import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StatusTone } from "./status-badge";

const TONE: Record<StatusTone, { surface: string; icon: typeof Info }> = {
  success: { surface: "bg-success-surface text-success-foreground", icon: CheckCircle2 },
  warning: { surface: "bg-warning-surface text-warning-foreground", icon: AlertTriangle },
  danger: { surface: "bg-danger-surface text-danger-foreground", icon: XCircle },
  info: { surface: "bg-info-surface text-info-foreground", icon: Info },
  neutral: { surface: "bg-neutral-surface text-neutral-foreground", icon: Info },
};

export interface BannerProps {
  tone: StatusTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Persistent banners (billing) use role=alert; transient status uses role=status. */
  assertive?: boolean;
  className?: string;
}

/** Full-width banner. Text and icon carry the meaning; colour is secondary. */
export function Banner({
  tone,
  title,
  children,
  action,
  assertive = false,
  className,
}: BannerProps) {
  const { surface, icon: Icon } = TONE[tone];
  return (
    <div
      role={assertive ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        surface,
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold">{title}</p>
          {children ? <div>{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
