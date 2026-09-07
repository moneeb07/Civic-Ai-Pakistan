import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * A single figure with its label and, where it helps, what it is a figure OF.
 *
 * Deliberately restrained. A row of big numbers is the fastest way to make a
 * dashboard look impressive and the fastest way to make it useless — so a tile
 * here can be `emphasis` (one per row, at most) and everything else stays
 * quiet. If every tile shouts, nothing is read.
 *
 * `tone` is a second, later-added way to colour a tile — a soft tint plus a
 * circular icon chip, for a small GROUP of tiles that are all peers (a
 * reported/in-process/resolved breakdown) rather than one figure standing
 * out among plain ones. It is additive: every existing caller that used only
 * `emphasis` renders exactly as before.
 */

type Tone = "neutral" | "danger" | "warning" | "success";

/*
 * Every tone reuses this project's own validated status palette rather than
 * inventing new colour — the same red/amber/green already checked for
 * contrast in globals.css, so a citizen never has to learn a second meaning
 * for "that shade of red" between the status pill on a report and the tile
 * that counts them.
 */
const TONE_STYLES: Record<Tone, { bg: string; icon: string; value: string }> = {
  neutral: {
    bg: "border-civic-200 bg-civic-50",
    icon: "bg-civic-600 text-white",
    value: "text-ink",
  },
  danger: {
    bg: "border-status-reported-line bg-status-reported-bg",
    icon: "bg-status-reported text-white",
    value: "text-status-reported",
  },
  warning: {
    bg: "border-status-process-line bg-status-process-bg",
    icon: "bg-status-process text-white",
    value: "text-status-process",
  },
  success: {
    bg: "border-status-resolved-line bg-status-resolved-bg",
    icon: "bg-status-resolved text-white",
    value: "text-ink",
  },
};

interface StatCardProps {
  label: string;
  value: string | number;
  /** The denominator, trend, or unit — the thing that makes the number mean something. */
  hint?: string;
  /** Token class for the number, e.g. "text-status-process". Defaults to ink. */
  valueClassName?: string;
  /** Fills the tile with the brand colour. Use for the one figure that matters most. */
  emphasis?: boolean;
  /** A soft tint + circular icon chip. Ignored when `emphasis` is set. */
  tone?: Tone;
  icon?: React.ComponentType<{ className?: string }>;
  /** Makes the whole tile a link, with a trailing arrow. */
  href?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  valueClassName,
  emphasis = false,
  tone,
  icon: Icon,
  href,
  className,
}: StatCardProps) {
  const toned = !emphasis && tone !== undefined;
  const palette = tone ? TONE_STYLES[tone] : null;

  const content = (
    <>
      <div className="flex items-center gap-2">
        {Icon && !toned ? (
          <Icon
            className={cn("size-3.5 shrink-0", emphasis ? "text-white/70" : "text-muted")}
            aria-hidden="true"
          />
        ) : null}
        {Icon && toned ? (
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-[12px]",
              palette!.icon,
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}
        <p
          className={cn(
            "text-[0.6875rem] font-semibold uppercase tracking-[0.12em]",
            emphasis ? "text-white/70" : "text-muted",
          )}
        >
          {label}
        </p>
        {href ? (
          <ArrowRight
            className={cn(
              "ms-auto size-4 shrink-0",
              emphasis ? "text-white/70" : "text-muted",
            )}
            aria-hidden="true"
          />
        ) : null}
      </div>

      {/* tabular-nums so a row of tiles keeps its digits on a common grid. */}
      <p
        className={cn(
          "text-[1.875rem] font-bold leading-none tracking-tight tabular-nums",
          toned ? "mt-2.5" : "mt-1",
          emphasis ? "text-white" : (valueClassName ?? palette?.value ?? "text-ink"),
        )}
      >
        {value}
      </p>

      {hint ? (
        <p className={cn("mt-1.5 text-[0.8125rem]", emphasis ? "text-white/75" : "text-muted")}>
          {hint}
        </p>
      ) : null}
    </>
  );

  const classes = cn(
    "rounded-[var(--radius-card)] border p-4 sm:p-5",
    emphasis
      ? "border-civic-600 bg-civic-600 text-white"
      : toned
        ? palette!.bg
        : "border-line bg-surface shadow-[var(--shadow-field)]",
    href && "transition-colors hover:border-civic-500",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return <div className={classes}>{content}</div>;
}
