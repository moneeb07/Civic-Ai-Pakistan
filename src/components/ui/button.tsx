import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // min-h-12 keeps every button a comfortable touch target on cheap Android handsets.
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-field)] text-[0.9375rem] font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        primary:
          "bg-civic-600 text-white hover:bg-civic-700 active:bg-civic-900 shadow-[var(--shadow-field)]",
        secondary:
          "border border-line-strong bg-surface text-ink hover:bg-civic-50 hover:border-civic-200 active:bg-civic-100",
        ghost: "text-civic-600 hover:bg-civic-50 active:bg-civic-100",
        danger: "bg-danger text-white hover:opacity-90",
      },
      size: {
        default: "px-5 py-3",
        full: "w-full px-5 py-3",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and blocks repeat submissions. */
  loading?: boolean;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {/* Slot requires a single child, so the spinner is only added for real buttons. */}
      {loading && !asChild ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
