import { useLightTranslations } from "@/i18n/light-provider";
import { cn } from "@/lib/utils";

/** A placeholder block. Decorative: the surrounding <Loading> announces the state. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-control bg-gradient-to-r from-muted via-surface to-muted bg-[length:200%_100%] motion-safe:animate-[shimmer_1.6s_ease-in-out_infinite]",
        className,
      )}
    />
  );
}

/** Skeleton lines for a list or card while data loads. Announced once, not per line. */
export function SkeletonList({ rows = 3, label }: { rows?: number; label?: string }) {
  const t = useLightTranslations("common");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{label ?? t("loading")}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
