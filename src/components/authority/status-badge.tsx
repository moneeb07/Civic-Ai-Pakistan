import { cn } from "@/lib/utils";
import { STATUS_LABELS, type IssueStatus } from "@/lib/authority/schema";

/*
 * One status, one colour, everywhere.
 *
 * Red / amber / green is the whole vocabulary of the workflow, so it is worth
 * being rigid about: a citizen, a department member and an admin all read the
 * same three colours to mean the same three things.
 */
const TONES: Record<IssueStatus, string> = {
  REPORTED: "border-danger/25 bg-danger-bg text-danger",
  IN_PROCESS: "border-amber-200 bg-amber-50 text-amber-800",
  RESOLVED: "border-civic-200 bg-civic-50 text-civic-800",
};

const DOTS: Record<IssueStatus, string> = {
  REPORTED: "bg-danger",
  IN_PROCESS: "bg-amber-500",
  RESOLVED: "bg-civic-600",
};

export function StatusBadge({
  status,
  className,
}: {
  status: IssueStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] font-semibold",
        TONES[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOTS[status])} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
