import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * The table shell.
 *
 * Presentational only — no sorting, no fetching, no pagination state. Those
 * belong to the page, which knows what it is listing; a table that owns them
 * ends up fighting server components for who holds the data.
 *
 * What it does own is the thing every hand-rolled table in this codebase kept
 * getting wrong: a wide table must scroll INSIDE its own container. Without
 * `overflow-x-auto` here, one column too many on a phone makes the entire page
 * scroll sideways, which is the single most common responsive bug there is.
 */

export function TableShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface",
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-[0.875rem]", className)} {...props} />;
}

export function Th({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap border-b border-line-strong px-4 pb-2.5 pt-4 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  numeric,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "border-b border-line px-4 py-3 align-middle",
        // Digits in a column only line up with tabular figures.
        numeric && "text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

/** A horizontal proportion bar, for rates and workloads inside a table cell. */
export function Meter({
  value,
  max = 100,
  tone = "brand",
  className,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "process" | "reported";
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill =
    tone === "process"
      ? "bg-status-process"
      : tone === "reported"
        ? "bg-status-reported"
        : "bg-civic-500";

  return (
    <span
      className={cn("block h-1.5 w-full min-w-[72px] overflow-hidden rounded-full bg-canvas", className)}
      role="img"
      aria-label={`${Math.round(pct)} percent`}
    >
      <span className={cn("block h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
    </span>
  );
}
