import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// 44px minimum target on every size (WCAG 2.2 target size; brief: 44px touch targets).
export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold " +
    "transition-colors motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
    "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-brand hover:brightness-110",
        secondary: "bg-surface text-foreground border border-input-border hover:bg-muted",
        ghost: "bg-transparent text-foreground hover:bg-muted",
        danger:
          "bg-danger-surface text-danger-foreground border border-danger/40 hover:brightness-95",
      },
      size: {
        default: "",
        lg: "min-h-12 px-5 text-base",
        icon: "size-11 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button. Announced to screen readers through aria-busy. */
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    loading = false,
    loadingLabel = "Loading",
    disabled,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});
