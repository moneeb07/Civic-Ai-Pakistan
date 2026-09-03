import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * A single figure with its label and, where it helps, what it is a figure OF.
 *
 * Deliberately restrained. A row of big numbers is the fastest way to make a
 * dashboard look impressive and the fastest way to make it useless — so a tile
 * here can be `emphasis` (one per row, at most) and everything else stays
 * quiet. If every tile shouts, nothing is read.
 */

interface StatCardProps {
  label: string;
  value: string | number;
  /** The denominator, trend, or unit — the thing that makes the number mean something. */
  hint?: string;
  /** Token class for the number, e.g. "text-status-process". Defaults to ink. */
  valueClassName?: string;
  /** Fills the tile with the brand colour. Use for the one figure that matters most. */
  emphasis?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  valueClassName,
  emphasis = false,
  icon: Icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border p-4 sm:p-5",
        emphasis
          ? "border-civic-600 bg-civic-600 text-white"
          : "border-line bg-surface shadow-[var(--shadow-field)]",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {Icon ? (
          <Icon
            className={cn("size-3.5 shrink-0", emphasis ? "text-white/70" : "text-muted")}
            aria-hidden="true"
          />
        ) : null}
        <p
          className={cn(
            "text-[0.6875rem] font-semibold uppercase tracking-[0.12em]",
            emphasis ? "text-white/70" : "text-muted",
          )}
        >
          {label}
        </p>
      </div>

      {/* tabular-nums so a row of tiles keeps its digits on a common grid. */}
      <p
        className={cn(
          "mt-1 text-[1.875rem] font-bold leading-none tracking-tight tabular-nums",
          emphasis ? "text-white" : (valueClassName ?? "text-ink"),
        )}
      >
        {value}
      </p>

      {hint ? (
        <p className={cn("mt-1.5 text-[0.8125rem]", emphasis ? "text-white/75" : "text-muted")}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
