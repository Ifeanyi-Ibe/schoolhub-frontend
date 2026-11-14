import { formatNaira } from "@/lib/format/money";
import { cn } from "@/lib/utils";

/** An amount in integer kobo, shown as naira with tabular figures so columns line up. */
export function Money({ kobo, className }: { kobo: number | bigint; className?: string }) {
  return (
    <span className={cn("tabular-nums whitespace-nowrap", className)}>{formatNaira(kobo)}</span>
  );
}
