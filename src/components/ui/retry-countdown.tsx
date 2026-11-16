"use client";

import { useLightTranslations } from "@/i18n/light-provider";
import { useEffect, useState } from "react";

/**
 * Counts down a Retry-After value. Visible text updates every second, but screen readers hear
 * it only when the wait ends, so the countdown does not chatter.
 */
export function useCountdown(seconds: number | null): number {
  const [left, setLeft] = useState(seconds ?? 0);
  useEffect(() => {
    if (seconds === null || seconds <= 0) {
      return;
    }
    const started = Date.now();
    const total = seconds;
    const id = window.setInterval(() => {
      const remaining = Math.max(0, total - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [seconds]);
  return seconds === null ? 0 : left;
}

export function RetryCountdown({ seconds, onDone }: { seconds: number; onDone?: () => void }) {
  const t = useLightTranslations("auth.login");
  const tr = useLightTranslations("retry");
  const left = useCountdown(seconds);
  useEffect(() => {
    if (left === 0) onDone?.();
  }, [left, onDone]);
  return (
    <div className="flex flex-col gap-1">
      <p aria-hidden="true" className="tabular-nums text-sm text-muted-foreground">
        {tr("seconds", { seconds: left })}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {left === 0 ? t("rateDone") : ""}
      </p>
    </div>
  );
}
