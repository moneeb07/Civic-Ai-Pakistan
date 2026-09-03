"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/*
 * A labelled field, composed from the shared Input and Label primitives.
 *
 * The citizen side's FormField is bound to react-hook-form's register(); the
 * government forms are small enough to hold their own state, so this is the
 * same visual treatment over plain controlled inputs rather than a second
 * dependency on a form library.
 *
 * The error message is wired to the input with aria-describedby and rendered
 * next to the field, never as colour alone.
 */
export function GovField({
  id,
  label,
  error,
  hint,
  className,
  children,
  ...inputProps
}: {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentProps<"input">, "id">) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>

      {children ?? (
        <Input
          id={id}
          invalid={Boolean(error)}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          {...inputProps}
        />
      )}

      {error ? (
        <p id={errorId} role="alert" className="text-[0.8125rem] font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[0.8125rem] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
