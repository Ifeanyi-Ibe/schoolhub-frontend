import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label. Required: every input has a programmatic label (WCAG 1.3.1 / 3.3.2). */
  label: ReactNode;
  hint?: ReactNode;
  /** Field error. Linked with aria-describedby and aria-invalid, and announced politely. */
  error?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, required, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-foreground">
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-11 w-full rounded-control border bg-surface px-3.5 text-base text-foreground shadow-card",
          "placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] duration-150",
          "hover:border-brand/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
          error ? "border-danger focus-visible:ring-danger/25" : "border-input-border",
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} aria-live="polite" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
