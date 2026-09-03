import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Append-only activity timeline.
 *
 * Used for an issue's history, which is a legal-ish record: entries are never
 * edited and never removed, and the component says so at the foot rather than
 * leaving a reader to assume it. The newest entry sits at the top and is the
 * only one given emphasis — the rest is context.
 */

export interface TimelineEntry {
  id: string;
  title: string;
  /** Who did it. Omit for events the system generated itself. */
  actor?: string | null;
  timestamp: string;
  /** Marks a status change rather than a routine note. */
  tone?: "default" | "reported" | "process" | "resolved";
}

const DOT_TONES = {
  default: "bg-line-strong",
  reported: "bg-status-reported",
  process: "bg-status-process",
  resolved: "bg-status-resolved",
} as const;

export function Timeline({
  entries,
  className,
}: {
  entries: TimelineEntry[];
  className?: string;
}) {
  return (
    <div className={className}>
      <ol className="relative space-y-0">
        {entries.map((entry, index) => {
          const isLatest = index === 0;
          const isLast = index === entries.length - 1;

          return (
            <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
              {/* The spine, drawn per-item so it stops cleanly at the last entry. */}
              {!isLast ? (
                <span
                  aria-hidden="true"
                  className="absolute left-[5px] top-4 h-full w-px bg-line"
                />
              ) : null}

              <span
                aria-hidden="true"
                className={cn(
                  "relative mt-1.5 size-[11px] shrink-0 rounded-full",
                  DOT_TONES[entry.tone ?? "default"],
                  isLatest && "ring-4 ring-canvas",
                )}
              />

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-[0.875rem] leading-snug",
                    isLatest ? "font-semibold text-ink" : "font-medium text-ink/85",
                  )}
                >
                  {entry.title}
                </p>
                <p className="mt-0.5 text-[0.75rem] text-muted">
                  {entry.actor ? `${entry.actor} · ` : ""}
                  {entry.timestamp}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 border-t border-line pt-2.5 text-[0.75rem] text-muted">
        Append-only. Entries are never edited or removed.
      </p>
    </div>
  );
}
