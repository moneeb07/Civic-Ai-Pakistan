import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * The form controls the design system was missing.
 *
 * `Input` and `Label` already existed; select and textarea were being
 * hand-rolled per screen with slightly different heights and borders each
 * time. These match Input exactly so a form mixing all three lines up.
 *
 * The 48px minimum height is not cosmetic: it is the touch target a thumb
 * needs on the cheap Android handsets most citizens will use.
 */

const FIELD_BASE =
  "w-full min-h-12 rounded-[var(--radius-field)] border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] text-ink shadow-[var(--shadow-field)] outline-none transition-colors placeholder:text-muted focus:border-civic-500 disabled:opacity-55";

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return <textarea className={cn(FIELD_BASE, "resize-y leading-relaxed", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        className={cn(FIELD_BASE, "appearance-none pr-10", className)}
        {...props}
      >
        {children}
      </select>
      {/* Pointer-events off so the chevron never eats the click. */}
      <ChevronDown
        className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </span>
  );
}

/**
 * Label, control and message as one block.
 *
 * The error is wired to the control through aria-describedby here rather than
 * at each call site, because that is exactly the wiring people forget — and a
 * validation message a screen reader never announces may as well not exist.
 */
export function FieldGroup({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-2 text-[0.875rem] font-semibold text-ink"
      >
        {label}
        {optional ? (
          <span className="text-[0.75rem] font-normal text-muted">Optional</span>
        ) : null}
      </label>

      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: htmlFor,
            "aria-describedby": describedBy,
            "aria-invalid": error ? true : undefined,
          })
        : children}

      {error ? (
        <p id={`${htmlFor}-error`} className="text-[0.8125rem] font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[0.8125rem] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
