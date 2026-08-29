import * as React from "react";

import { cn } from "@/lib/utils";

// ComponentProps (not InputHTMLAttributes) so that `ref` is part of the prop
// type — React 19 passes it as a normal prop, which is how react-hook-form's
// `register()` result attaches itself.
interface InputProps extends React.ComponentProps<"input"> {
  /** Renders the error treatment. Pair with a visible message — never colour alone. */
  invalid?: boolean;
}

function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      // text-base (16px) stops iOS Safari from zooming the viewport on focus.
      className={cn(
        "min-h-12 w-full rounded-[var(--radius-field)] border bg-surface px-4 text-base text-ink shadow-[var(--shadow-field)] transition-colors duration-150",
        "placeholder:text-muted/70",
        "focus:outline-none focus-visible:border-civic-600 focus-visible:ring-2 focus-visible:ring-civic-600/20",
        "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted",
        invalid
          ? "border-danger bg-danger-bg focus-visible:border-danger focus-visible:ring-danger/20"
          : "border-line-strong",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export { Input };
