import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** The next action, for example a button that starts the first record. */
  action?: ReactNode;
  icon?: LucideIcon;
}

export function EmptyState({ title, description, action, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center">
      <Icon className="size-10 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}
