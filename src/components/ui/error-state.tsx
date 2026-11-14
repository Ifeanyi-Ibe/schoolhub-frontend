"use client";

import { AlertIcon } from "./icons";
import { useTranslations } from "next-intl";
import { problemDetailsForCopy, type ApiProblem } from "@/lib/api/problem";
import { Button } from "./button";
import { useToast } from "./toast";

export interface ErrorStateProps {
  title: string;
  description?: string;
  problem?: ApiProblem | null;
  onRetry?: () => void;
}

/**
 * Error with a retry action and "copy error details" (includes the trace ID for support).
 * Copied text never includes request bodies or tokens (see problemDetailsForCopy).
 */
export function ErrorState({ title, description, problem, onRetry }: ErrorStateProps) {
  const t = useTranslations("common");
  const toast = useToast();

  async function copy() {
    if (!problem) return;
    try {
      await navigator.clipboard.writeText(problemDetailsForCopy(problem));
      toast({ tone: "success", title: t("errorDetailsCopied") });
    } catch {
      toast({ tone: "danger", title: t("errorDetailsCopyFailed") });
    }
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-card border border-danger/40 bg-danger-surface p-4 text-danger-foreground"
    >
      <div className="flex items-start gap-2">
        <AlertIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{title}</p>
          {description ? <p className="text-sm">{description}</p> : null}
          {problem && (problem.code || problem.traceId) ? (
            <p className="text-xs tabular-nums">
              {problem.code ? `${t("errorCode")}: ${problem.code}` : null}
              {problem.code && problem.traceId ? " · " : null}
              {problem.traceId ? `${t("traceId")}: ${problem.traceId}` : null}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {t("retry")}
          </Button>
        ) : null}
        {problem ? (
          <Button variant="ghost" onClick={copy}>
            {t("copyErrorDetails")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
