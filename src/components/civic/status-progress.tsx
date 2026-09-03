import { cn } from "@/lib/utils";

import { ProgressTracker } from "@/components/ui/progress-tracker";
import { deriveStatus } from "@/lib/civic/status";

/*
 * The citizen-facing status tracker.
 *
 * This is now a thin adapter over the shared ProgressTracker rather than its
 * own implementation. It used to draw its own beads and rails from `bg-danger`
 * (the FORM-ERROR colour) and raw `amber-500`/`amber-700` Tailwind utilities —
 * neither of which is a status token, so the citizen dashboard and the
 * government screens were slowly drifting to different reds and ambers for the
 * same three states. The colours also predated the accessibility pass: the old
 * red and amber measured ΔE 14.2 apart for a normal-sighted reader, below the
 * legibility floor, which made "reported" and "in process" the two hardest
 * states to tell apart when they are the two that most need separating.
 *
 * The public API is unchanged — `stageName` plus `isResolved`, exactly what the
 * tracking service returns — so every existing caller keeps working.
 *
 * The reason it still exists at all, rather than callers using ProgressTracker
 * directly: this signature speaks the CITIZEN's data shape. Departments define
 * their own workflows, so the tracking service reports "which stage, and is it
 * terminal", never a three-state enum. Translating that into the lifecycle
 * belongs in one place.
 */
export function StatusProgress({
  stageName,
  isResolved,
  size = "default",
  className,
}: {
  /** The department's current workflow stage, or null before assignment. */
  stageName: string | null;
  isResolved: boolean;
  size?: "default" | "compact";
  className?: string;
}) {
  return (
    <ProgressTracker
      status={deriveStatus({ stageName, isResolved })}
      // The middle step shows the department's own words for the step it is
      // actually on, rather than flattening every workflow to "in progress".
      stageLabel={stageName}
      size={size === "compact" ? "sm" : "md"}
      className={cn(className)}
    />
  );
}
