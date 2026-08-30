import Link from "next/link";
import { Camera, MapPin, TriangleAlert, Users } from "lucide-react";

import { StatusProgress } from "@/components/civic/status-progress";
import { categoryLabel } from "@/lib/authority/schema";
import { formatDate } from "@/lib/civic/format-date";
import type { TrackedReport } from "@/lib/civic/tracking";

/*
 * One of the citizen's own reports, and what became of it.
 *
 * The "N citizens reported this" line is the moment CivicAI's core idea
 * becomes visible to the person it matters most to: their complaint was not
 * filed away alone, it joined twenty-five others about the same pothole. That
 * is worth showing prominently.
 */
export function TrackedReportCard({ report }: { report: TrackedReport }) {
  const issue = report.issue;

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {issue ? (
          <span className="font-mono text-[0.8125rem] font-bold tracking-tight text-civic-700">
            {issue.issueCode}
          </span>
        ) : (
          <span className="rounded-full border border-line-strong bg-canvas px-2 py-0.5 text-[0.6875rem] font-semibold text-muted">
            {report.reportStatus === "ready_for_submission"
              ? "Being routed"
              : "Draft — not submitted"}
          </span>
        )}
        {report.category ? (
          <span className="text-[0.75rem] text-muted">{categoryLabel(report.category)}</span>
        ) : null}
      </div>

      <p className="mt-1.5 text-[0.9375rem] font-semibold leading-snug text-ink">
        {issue?.title || report.title || "Untitled report"}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-muted">
        {report.locationLabel ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3" aria-hidden="true" />
            {report.locationLabel}
          </span>
        ) : null}
        {report.hasImage ? (
          <span className="inline-flex items-center gap-1.5">
            <Camera className="size-3" aria-hidden="true" />
            Photo attached
          </span>
        ) : null}
        <span>{formatDate(report.submittedAt)}</span>
      </div>

      {issue ? (
        <>
          <div className="mt-4">
            <StatusProgress status={issue.status} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-muted">
            {issue.reportCount > 1 ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-civic-700">
                <Users className="size-3" aria-hidden="true" />
                {issue.reportCount} citizens reported this
              </span>
            ) : null}
            {issue.departmentName ? (
              <span>
                {issue.departmentName} · {issue.authorityName}
              </span>
            ) : (
              <span>Awaiting department assignment</span>
            )}
          </div>

          {/*
            Said out loud rather than hidden. If the grouping was uncertain the
            citizen should know their report is provisionally attached and may
            yet be separated — that is more honest than a confident-looking
            issue code.
          */}
          {issue.needsReview ? (
            <p className="mt-2 inline-flex items-start gap-1.5 rounded-[10px] bg-amber-50 px-2 py-1 text-[0.6875rem] leading-relaxed text-amber-900">
              <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden="true" />
              Provisionally grouped with this issue. The department will confirm
              whether it is the same problem.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-[0.75rem] leading-relaxed text-muted">
          {report.reportStatus === "ready_for_submission"
            ? "Submitted. It is being matched to a civic issue and routed to the right department."
            : "This report has not been submitted yet."}
        </p>
      )}
    </>
  );

  if (!issue) {
    return <div className="rounded-[18px] border border-line bg-surface p-4">{body}</div>;
  }

  return (
    <Link
      href={`/dashboard/reports/${issue.issueCode}`}
      className="block rounded-[18px] border border-line bg-surface p-4 transition-colors hover:border-civic-200 hover:bg-civic-50/40"
    >
      {body}
    </Link>
  );
}
