"use client";

import Link from "next/link";
import { AlertTriangle, MapPin, Star } from "lucide-react";

import { formatTimestamp, humanizeCategory, isOverdue } from "@/lib/gov/format";
import type { ComplaintDto } from "@/lib/gov/schema";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const t = getDictionary();

/*
 * One complaint in a queue.
 *
 * The whole card is a link to the detail page rather than a row with a button,
 * so the tap target is the full row on a 360px screen — the same reasoning
 * behind the citizen side's ActionRow.
 *
 * Overdue is computed from the stage's own SLA and flagged in red text plus an
 * icon, never colour alone.
 */
export function ComplaintCard({
  complaint,
  href,
  footer,
}: {
  complaint: ComplaintDto;
  href?: string;
  footer?: React.ReactNode;
}) {
  const assignment = complaint.assignment;
  const overdue = isOverdue(assignment?.stageEnteredAt ?? null, assignment?.slaHours ?? null);

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[0.9375rem] font-semibold text-ink">
            {complaint.title ?? t.gov.complaint.noTitle}
          </h3>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted">
            {complaint.category ? <span>{humanizeCategory(complaint.category)}</span> : null}
            {complaint.severity ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{complaint.severity}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>{formatTimestamp(complaint.submittedAt)}</span>
          </p>

          {complaint.locationLabel ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-[0.8125rem] text-muted">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{complaint.locationLabel}</span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {assignment?.isResolved ? (
            <Badge tone="success">{t.gov.complaint.resolvedBadge}</Badge>
          ) : assignment?.currentStageName ? (
            <Badge tone="neutral">{assignment.currentStageName}</Badge>
          ) : null}

          {complaint.needsAttention ? (
            <span className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-danger">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {t.gov.dept.needsAttention}
            </span>
          ) : null}

          {overdue && !assignment?.isResolved ? (
            <span className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-danger">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {t.gov.complaint.overdue}
            </span>
          ) : null}

          {complaint.rating ? (
            <span className="inline-flex items-center gap-1 text-[0.75rem] text-muted">
              <Star className="size-3.5" aria-hidden="true" />
              {complaint.rating.stars}/5
            </span>
          ) : null}
        </div>
      </div>

      {assignment ? (
        <p className="mt-2 truncate text-[0.75rem] text-muted">
          {assignment.deptName}
          {assignment.assignedOfficerName
            ? ` · ${assignment.assignedOfficerName}`
            : ` · ${t.gov.dept.unassigned}`}
        </p>
      ) : null}

      {footer ? <div className="mt-4">{footer}</div> : null}
    </>
  );

  const shell = cn(
    "block rounded-[18px] border bg-surface p-4 text-start transition-colors",
    complaint.needsAttention ? "border-danger/25" : "border-line",
    href && "hover:border-civic-200 hover:bg-civic-50/40",
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}

function Badge({ tone, children }: { tone: "success" | "neutral"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold",
        tone === "success" ? "bg-civic-50 text-civic-700" : "bg-canvas text-muted",
      )}
    >
      {children}
    </span>
  );
}
