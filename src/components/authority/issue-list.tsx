import Link from "next/link";
import { MapPin, MessageSquareWarning, Users } from "lucide-react";

import { StatusBadge } from "@/components/authority/status-badge";
import { categoryLabel } from "@/lib/authority/schema";
import type { IssueListItem } from "@/lib/authority/queries";

/*
 * The issue queue.
 *
 * Ordered by report count first: the number of citizens affected is the most
 * honest priority signal an authority has, and it is the one thing a
 * department cannot see when it is looking at raw reports one at a time.
 *
 * The Issue ID is the link, everywhere in the product — it is meant to be
 * quoted, searched and clicked.
 */
export function IssueList({ issues }: { issues: IssueListItem[] }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-line-strong bg-surface p-8 text-center">
        <p className="text-[0.9375rem] font-semibold text-ink">No issues here yet</p>
        <p className="mt-1.5 text-[0.875rem] text-muted">
          Confirmed citizen reports appear here once they have been routed.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {issues.map((issue) => (
        <li key={issue.id}>
          <Link
            href={`/authority/issues/${issue.issueCode}`}
            className="block rounded-[18px] border border-line bg-surface p-4 transition-colors hover:border-civic-200 hover:bg-civic-50/40"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[0.8125rem] font-bold tracking-tight text-civic-700">
                {issue.issueCode}
              </span>
              <StatusBadge status={issue.status} />
              {issue.needsReviewCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-800">
                  <MessageSquareWarning className="size-3" aria-hidden="true" />
                  {issue.needsReviewCount} to review
                </span>
              ) : null}
            </div>

            <p className="mt-2 text-[0.9375rem] font-semibold leading-snug text-ink">
              {issue.title}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden="true" />
                {issue.reportCount} citizen {issue.reportCount === 1 ? "report" : "reports"}
              </span>
              {issue.locationLabel ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {issue.locationLabel}
                </span>
              ) : null}
              <span>{categoryLabel(issue.category)}</span>
              {issue.departmentName ? <span>{issue.departmentName}</span> : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
