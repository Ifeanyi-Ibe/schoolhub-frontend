import { forwardRef, type ReactNode, type SelectHTMLAttributes, useId } from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Visible label. Required: every field has a programmatic label (WCAG 1.3.1 / 3.3.2). */
  label: ReactNode;
  hint?: ReactNode;
  /** Field error. Linked with aria-describedby and aria-invalid, and announced politely. */
  error?: ReactNode;
}

/** A native select with the same label, hint and error behaviour as Input, and a chevron. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className, children, ...rest },
  ref,
) {
  const generated = useId();
  const selectId = id ?? generated;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "min-h-11 w-full appearance-none rounded-control border bg-surface py-2 pl-3.5 pr-10 text-base text-foreground shadow-card",
            "transition-[border-color,box-shadow] duration-150 hover:border-brand/50",
            "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25",
            "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
            error ? "border-danger" : "border-input-border",
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {error ? (
        <p id={errorId} aria-live="polite" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
