import * as React from "react";

import { cn } from "@/lib/utils";
import {
  CIVIC_STATUSES,
  statusIndex,
  statusPresentation,
  type CivicStatus,
} from "@/lib/civic/status";

/*
 * The three-step civic tracker — the product's signature control.
 *
 *   ●───────────●───────────○
 *   Reported    In process  Resolved
 *
 * It answers the only question most citizens actually have: where is my
 * report, right now. That is why it reads as POSITION first and text second —
 * somebody can see where they are across a room, before reading a word.
 *
 * Two details that matter:
 *
 * 1. The middle step can carry the DEPARTMENT'S own stage name ("Inspection
 *    scheduled", "Valve isolated") instead of the generic "In process". Each
 *    department defines its own workflow, and telling a citizen the real stage
 *    is more honest and more useful than flattening it. The three-step shape
 *    stays constant so the control is still recognisable everywhere.
 *
 * 2. Completed steps and the current step are distinguished by FILL, not just
 *    colour, and the current step carries a ring. Red/amber/green alone is
 *    unreadable for colour-blind users; shape and the label carry it too.
 */

interface ProgressTrackerProps {
  status: CivicStatus;
  /**
   * The department's own name for the middle stage, when the issue is with a
   * department. Falls back to "In process".
   */
  stageLabel?: string | null;
  size?: "sm" | "md";
  className?: string;
}

export function ProgressTracker({
  status,
  stageLabel,
  size = "md",
  className,
}: ProgressTrackerProps) {
  const current = statusIndex(status);
  const small = size === "sm";

  return (
    <div
      className={cn("flex w-full items-start", className)}
      role="group"
      aria-label={`Progress: ${statusPresentation(status).label}`}
    >
      {CIVIC_STATUSES.map((step, index) => {
        const presentation = statusPresentation(step);
        const isDone = index < current;
        const isCurrent = index === current;
        const reached = isDone || isCurrent;

        // Only the middle step borrows the department's wording.
        const label =
          index === 1 && stageLabel && isCurrent ? stageLabel : presentation.label;

        return (
          <React.Fragment key={step}>
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "mt-[7px] h-[3px] flex-1 rounded-full transition-colors",
                  small && "mt-[5px] h-0.5",
                  isDone || isCurrent ? "bg-civic-500" : "bg-line-strong",
                )}
              />
            ) : null}

            <span
              className={cn(
                "flex shrink-0 flex-col items-center gap-1.5 px-1",
                small ? "w-[68px]" : "w-[86px]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "rounded-full border-[2.5px] transition-all",
                  small ? "size-3" : "size-4",
                  reached
                    ? cn(presentation.fill, "border-transparent")
                    : "border-line-strong bg-surface",
                  // The live step gets a halo, so "where am I now" survives a
                  // greyscale print or a colour-blind reader.
                  isCurrent && "ring-4 ring-offset-0",
                  isCurrent && step === "REPORTED" && "ring-status-reported-bg",
                  isCurrent && step === "IN_PROCESS" && "ring-status-process-bg",
                  isCurrent && step === "RESOLVED" && "ring-status-resolved-bg",
                )}
              />
              <span
                className={cn(
                  "text-center font-semibold leading-tight",
                  small ? "text-[0.625rem]" : "text-[0.6875rem]",
                  isCurrent ? presentation.text : reached ? "text-ink" : "text-muted",
                )}
              >
                {label}
              </span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}
