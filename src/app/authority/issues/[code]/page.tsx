import { notFound } from "next/navigation";
import {
  Clock,
  FileText,
  MapPin,
  Route as RouteIcon,
  TriangleAlert,
  Users,
} from "lucide-react";

import { formatDateTime } from "@/lib/civic/format-date";
import { StatusProgress } from "@/components/civic/status-progress";
import { DiscussionPanel } from "@/components/authority/discussion-panel";
import { DuplicateReview } from "@/components/authority/duplicate-review";
import { StatusBadge } from "@/components/authority/status-badge";
import { StatusControl } from "@/components/authority/status-control";
import {
  canAccessIssue,
  requireAuthorityViewer,
} from "@/lib/authority/access";
import {
  getIssueByCode,
  listConversations,
  listDepartmentMembers,
  listIssueReports,
  listStatusHistory,
} from "@/lib/authority/queries";
import { categoryLabel, STATUS_LABELS, type IssueStatus } from "@/lib/authority/schema";

export const dynamic = "force-dynamic";

/*
 * The issue workspace — everything about one real-world problem in one place:
 * what it is, where it is, which citizen reports make it up, how it was
 * routed, how confident the grouping was, its status history, and the
 * discussions about it.
 */
export default async function IssueWorkspacePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const viewer = await requireAuthorityViewer();
  const { code } = await params;

  const issue = await getIssueByCode(decodeURIComponent(code));
  // A 404 rather than a 403 for an issue outside the viewer's scope: whether
  // it exists is itself information they should not have.
  if (!issue || !canAccessIssue(viewer, issue)) notFound();

  const viewerMemberIds = viewer.memberships.map((m) => m.memberId);

  const [reports, history, conversations, members] = await Promise.all([
    listIssueReports(issue.id),
    listStatusHistory(issue.id),
    listConversations(issue.id, viewerMemberIds),
    issue.departmentId ? listDepartmentMembers(issue.departmentId) : Promise.resolve([]),
  ]);

  const needsReview = reports.filter((r) => r.matchStatus === "needs_review");

  return (
    <div className="space-y-6">
      <header className="rounded-[20px] border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.9375rem] font-bold tracking-tight text-civic-700">
            {issue.issueCode}
          </span>
          <StatusBadge status={issue.status} />
        </div>

        <h1 className="mt-2 text-[1.25rem] font-bold leading-snug tracking-tight text-ink">
          {issue.title}
        </h1>

        {issue.description ? (
          <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
            {issue.description}
          </p>
        ) : null}

        {/*
          The same tracker the citizen sees on their own report. Using one
          component on both sides is the point: the promise made to the public
          and the state the department works from are literally the same thing.
        */}
        <div className="mt-5 max-w-md">
          <StatusProgress status={issue.status} />
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact icon={<Users className="size-3.5" />} label="Citizen reports">
            {issue.reportCount}
          </Fact>
          <Fact icon={<FileText className="size-3.5" />} label="Category">
            {categoryLabel(issue.category)}
          </Fact>
          <Fact icon={<RouteIcon className="size-3.5" />} label="Department">
            {issue.departmentName ?? "Not yet assigned"}
          </Fact>
          <Fact icon={<MapPin className="size-3.5" />} label="Location">
            {issue.locationLabel ?? "Not recorded"}
          </Fact>
        </dl>

        {/*
          The routing decision, shown rather than hidden. A member who thinks a
          report landed in the wrong department deserves to see the reasoning
          instead of being told to trust it.
        */}
        {issue.routingRationale ? (
          <p className="mt-4 rounded-[14px] border border-line bg-canvas px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-muted">
            <span className="font-semibold text-ink">AI routing:</span>{" "}
            {issue.routingRationale}
            {issue.routingConfidence !== null ? (
              <> ({Math.round(issue.routingConfidence * 100)}% confidence)</>
            ) : null}
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          {needsReview.length > 0 ? (
            <section className="rounded-[20px] border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-amber-700" aria-hidden="true" />
                <h2 className="text-[0.9375rem] font-semibold text-amber-900">
                  {needsReview.length} grouping
                  {needsReview.length === 1 ? "" : "s"} to confirm
                </h2>
              </div>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-amber-900/80">
                These reports looked like the same problem, but not clearly
                enough to group without asking. Confirm them, or split them into
                their own issue.
              </p>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 text-[1rem] font-semibold text-ink">
              Citizen reports ({reports.length})
            </h2>
            <ul className="space-y-2.5">
              {reports.map((linked) => (
                <li
                  key={linked.linkId}
                  className="rounded-[18px] border border-line bg-surface p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <MatchBadge status={linked.matchStatus} />
                    {linked.similarity !== null ? (
                      <span className="text-[0.75rem] text-muted">
                        {Math.round(linked.similarity * 100)}% match
                      </span>
                    ) : null}
                    <span className="text-[0.75rem] text-muted">
                      {formatDateTime(linked.createdAt)}
                    </span>
                  </div>

                  {linked.transcript ? (
                    <p className="mt-2 text-[0.875rem] leading-relaxed text-ink/90">
                      “{linked.transcript}”
                    </p>
                  ) : linked.description ? (
                    <p className="mt-2 text-[0.875rem] leading-relaxed text-ink/90">
                      {linked.description}
                    </p>
                  ) : null}

                  <p className="mt-1.5 text-[0.75rem] text-muted">
                    {linked.locationLabel ?? "No location recorded"}
                    {linked.hasImage ? " · photo attached" : ""}
                  </p>

                  {linked.matchRationale ? (
                    <p className="mt-1.5 text-[0.75rem] leading-relaxed text-muted">
                      {linked.matchRationale}
                    </p>
                  ) : null}

                  {linked.matchStatus === "needs_review" ? (
                    <DuplicateReview linkId={linked.linkId} />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <DiscussionPanel
            issueCode={issue.issueCode}
            conversations={conversations}
            members={members}
            viewerMemberIds={viewerMemberIds}
          />
        </div>

        <aside className="space-y-4">
          <StatusControl issueCode={issue.issueCode} status={issue.status} />

          <section className="rounded-[18px] border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 text-muted" aria-hidden="true" />
              <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">
                Status history
              </h2>
            </div>

            <ol className="mt-3 space-y-3">
              {history.map((event) => (
                <li key={event.id} className="border-s-2 border-line ps-3">
                  <p className="text-[0.8125rem] font-medium text-ink">
                    {event.fromStatus
                      ? `${STATUS_LABELS[event.fromStatus as IssueStatus] ?? event.fromStatus} → `
                      : ""}
                    {STATUS_LABELS[event.toStatus as IssueStatus] ?? event.toStatus}
                  </p>
                  <p className="text-[0.6875rem] text-muted">
                    {formatDateTime(event.createdAt)}
                    {event.memberName ? ` · ${event.memberName}` : " · system"}
                  </p>
                  {event.note ? (
                    <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">
                      {event.note}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-[0.875rem] font-medium text-ink">{children}</dd>
    </div>
  );
}

/** How a report came to be on this issue, said plainly. */
function MatchBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    first_report: {
      label: "First report",
      className: "border-line-strong bg-canvas text-muted",
    },
    auto_grouped: {
      label: "Grouped by AI",
      className: "border-civic-200 bg-civic-50 text-civic-800",
    },
    confirmed: {
      label: "Confirmed by a member",
      className: "border-civic-200 bg-civic-50 text-civic-800",
    },
    needs_review: {
      label: "Needs review",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    },
    seed_group: {
      label: "Demo data",
      className: "border-line-strong bg-canvas text-muted",
    },
  };

  const tone = map[status] ?? map.first_report;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold ${tone.className}`}
    >
      {tone.label}
    </span>
  );
}
