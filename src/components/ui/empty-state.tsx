import { type IconComponent, InboxIcon } from "./icons";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** The next action, for example a button that starts the first record. */
  action?: ReactNode;
  icon?: IconComponent;
}

/** Nothing here yet: an icon badge, a clear title, the reason, and the next step. */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon = InboxIcon,
}: EmptyStateProps) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-card border border-dashed border-border bg-surface/70 px-6 py-12 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground ring-8 ring-brand-soft/40">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="flex max-w-prose flex-col gap-1.5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </section>
  );
}
