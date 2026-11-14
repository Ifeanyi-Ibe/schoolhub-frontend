import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** A placeholder block. Decorative: the surrounding <Loading> announces the state. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-control bg-muted motion-safe:animate-pulse", className)}
    />
  );
}

/** Skeleton lines for a list or card while data loads. Announced once, not per line. */
export function SkeletonList({ rows = 3, label }: { rows?: number; label?: string }) {
  const t = useTranslations("common");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{label ?? t("loading")}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
