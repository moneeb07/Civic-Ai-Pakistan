import { cn } from "@/lib/utils";
import { ISSUE_STATUSES, STATUS_LABELS, type IssueStatus } from "@/lib/authority/schema";

/*
 * The 🔴 ── 🟠 ── 🟢 tracker.
 *
 * Deliberately ONE component used on both sides of the product — the citizen
 * tracking their own complaint and the department member working it see the
 * same three dots in the same order with the same colours. A civic promise
 * that renders differently depending on who is looking at it is not much of a
 * promise.
 *
 * The pulse is on the ACTIVE stage only, and only while the issue is still
 * moving. A resolved issue glows steadily instead: it is finished, and a
 * blinking "done" reads as unfinished.
 */

const DOT_TONE: Record<IssueStatus, string> = {
  REPORTED: "bg-danger",
  IN_PROCESS: "bg-amber-500",
  RESOLVED: "bg-civic-600",
};

const RING_TONE: Record<IssueStatus, string> = {
  REPORTED: "ring-danger/25",
  IN_PROCESS: "ring-amber-500/25",
  RESOLVED: "ring-civic-600/25",
};

const TEXT_TONE: Record<IssueStatus, string> = {
  REPORTED: "text-danger",
  IN_PROCESS: "text-amber-700",
  RESOLVED: "text-civic-700",
};

export function StatusProgress({
  status,
  size = "default",
  className,
}: {
  status: IssueStatus;
  size?: "default" | "compact";
  className?: string;
}) {
  const currentIndex = ISSUE_STATUSES.indexOf(status);
  const compact = size === "compact";

  return (
    <div
      className={cn("w-full", className)}
      role="img"
      aria-label={`Status: ${STATUS_LABELS[status]}`}
    >
      <div className="flex items-center">
        {ISSUE_STATUSES.map((stage, index) => {
          const reached = index <= currentIndex;
          const isCurrent = index === currentIndex;
          const isFinalResolved = isCurrent && stage === "RESOLVED";

          return (
            <div key={stage} className="flex flex-1 items-center last:flex-none">
              <span className="relative flex items-center justify-center">
                {/*
                  The halo. Animated while the issue is still in motion, static
                  once resolved — a pulsing "done" would read as unfinished.
                */}
                {isCurrent ? (
                  <span
                    className={cn(
                      "absolute rounded-full",
                      compact ? "size-4" : "size-5",
                      DOT_TONE[stage],
                      isFinalResolved ? "opacity-25" : "animate-ping opacity-60",
                    )}
                    aria-hidden="true"
                  />
                ) : null}

                <span
                  className={cn(
                    "relative rounded-full transition-colors",
                    compact ? "size-2.5" : "size-3",
                    reached ? DOT_TONE[stage] : "bg-line-strong",
                    isCurrent && `ring-4 ${RING_TONE[stage]}`,
                  )}
                />
              </span>

              {/* Connector, filled only as far as the issue has actually got. */}
              {index < ISSUE_STATUSES.length - 1 ? (
                <span
                  className={cn(
                    "mx-1.5 h-0.5 flex-1 rounded-full transition-colors",
                    index < currentIndex ? DOT_TONE[ISSUE_STATUSES[index + 1]] : "bg-line",
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {!compact ? (
        <div className="mt-2 flex items-center justify-between">
          {ISSUE_STATUSES.map((stage, index) => (
            <span
              key={stage}
              className={cn(
                "text-[0.6875rem] font-semibold uppercase tracking-[0.08em]",
                index === currentIndex ? TEXT_TONE[stage] : "text-muted",
                index === 0 && "text-start",
                index === ISSUE_STATUSES.length - 1 && "text-end",
              )}
            >
              {STATUS_LABELS[stage]}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
