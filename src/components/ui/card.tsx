import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-card border border-border/80 bg-surface p-5 shadow-card sm:p-6",
        className,
      )}
      {...rest}
    />
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn("font-display text-lg font-semibold tracking-tight text-foreground", className)}
    >
      {children}
    </h2>
  );
}
