import { notFound } from "next/navigation";
import { Layers, MapPin, Sparkles } from "lucide-react";

import { GovShell } from "@/components/gov/gov-shell";
import { IssueDiscussion } from "@/components/gov/issue-discussion";
import { IssueClarifications } from "@/components/gov/issue-clarifications";
import { requireOfficer } from "@/lib/gov/session";
import {
  canViewIssue,
  findIssueByCode,
  getIssueDetail,
  listConversations,
  listDepartmentOfficers,
  listIssueReports,
} from "@/lib/gov/collaboration";
import { listThreadsForIssue } from "@/lib/gov/clarification";
import { getIssueProgress } from "@/lib/gov/issue-progress";
import { ProgressTracker } from "@/components/ui/progress-tracker";
import { StatusBadge } from "@/components/ui/badge";
import { Timeline } from "@/components/ui/timeline";
import { formatDate, formatDateTime } from "@/lib/civic/format-date";

export const dynamic = "force-dynamic";

/*
 * The issue workspace — one page per civic issue, and the destination every
 * notification deep-links into.
 *
 * It puts three things that used to live in three different tools side by side:
 * what the AI grouped together, what the department is saying about it, and
 * what the department has asked the people who reported it.
 */
export default async function IssuePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ thread?: string }>;
}) {
  const { code } = await params;
  const { thread } = await searchParams;
  const { officer } = await requireOfficer();

  const scope = await findIssueByCode(decodeURIComponent(code));
  /*
   * An issue outside this officer's scope is a 404, not a 403 — the same answer
   * as one that does not exist, so the page cannot be used to confirm that a
   * given issue code belongs to another department.
   */
  if (!scope || !canViewIssue(officer, scope)) notFound();

  const [issue, reports, conversations, threads, progress] = await Promise.all([
    getIssueDetail(scope.id),
    listIssueReports(scope.id),
    listConversations(scope.id, officer.id),
    listThreadsForIssue(scope.id),
    getIssueProgress(scope.id),
  ]);
  if (!issue) notFound();

  // Mentionable people are the department roster. An unrouted issue has no
  // department yet, so there is nobody to mention until it is routed.
  const roster = scope.deptId ? await listDepartmentOfficers(scope.deptId) : [];

  return (
    <GovShell officer={officer} backHref="/gov">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.8125rem] font-bold text-civic-700">
            {issue.issueCode}
          </span>
          {issue.reportCount > 1 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-civic-100 px-2.5 py-0.5 text-[0.75rem] font-semibold text-civic-800">
              <Layers className="size-3" aria-hidden="true" />
              {issue.reportCount} reports grouped
            </span>
          ) : null}
          {issue.deptName ? (
            <span className="rounded-full bg-canvas px-2.5 py-0.5 text-[0.75rem] text-muted">
              {issue.deptName}
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[0.75rem] font-medium text-amber-800">
              Not routed yet
            </span>
          )}
        </div>

        <h1 className="mt-2 text-[1.375rem] font-bold leading-snug tracking-tight text-ink">
          {issue.title}
        </h1>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted">
          {issue.locationLabel ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {issue.locationLabel}
            </span>
          ) : null}
          <span>Opened {formatDate(issue.createdAt)}</span>
        </div>

        {issue.description ? (
          <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-ink/80">
            {issue.description}
          </p>
        ) : null}

        {/*
          Where it stands, as position rather than as a word. The middle step
          carries the DEPARTMENT's own stage name, so an officer sees
          "Inspection scheduled" rather than a flattened "In process".
        */}
        {progress ? (
          <div className="mt-5 rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={progress.status} />
              {progress.stagePosition && progress.totalStages > 0 ? (
                <span className="text-[0.8125rem] text-muted">
                  Stage {progress.stagePosition} of {progress.totalStages}
                  {progress.stageName ? ` — ${progress.stageName}` : ""}
                </span>
              ) : (
                <span className="text-[0.8125rem] text-muted">
                  No department has picked this up yet.
                </span>
              )}
            </div>

            <div className="mt-4 max-w-md">
              <ProgressTracker status={progress.status} stageLabel={progress.stageName} />
            </div>
          </div>
        ) : null}

        {/*
          The routing rationale is shown, not hidden behind a tooltip. An officer
          who can see why a department was suggested can disagree with it; one
          who is only told the answer can only comply.
        */}
        {issue.routingRationale ? (
          <div className="mt-3 rounded-[14px] border border-line bg-canvas/60 p-3">
            <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-ink">
              <Sparkles className="size-3.5 text-civic-700" aria-hidden="true" />
              Why this department was suggested
              {issue.routingConfidence !== null ? (
                <span className="font-normal text-muted">
                  {Math.round(issue.routingConfidence * 100)}% confidence
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
              {issue.routingRationale}
            </p>
          </div>
        ) : null}
      </header>

      <section className="mt-6 rounded-[20px] border border-line bg-surface">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-[0.9375rem] font-semibold text-ink">
            Reports in this issue ({reports.length})
          </h2>
        </header>
        <ul className="divide-y divide-line">
          {reports.map((report) => (
            <li key={report.linkId} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[0.875rem] font-medium text-ink">
                  {report.title ?? "Untitled report"}
                </p>
                {/*
                  A provisional grouping says so on its face. The AI is allowed
                  to be unsure; it is not allowed to look sure.
                */}
                {report.matchStatus === "needs_review" ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-800">
                    Unconfirmed match
                  </span>
                ) : null}
                <span className="ms-auto text-[0.75rem] text-muted">
                  {formatDate(report.createdAt)}
                </span>
              </div>
              {report.locationLabel ? (
                <p className="mt-0.5 text-[0.8125rem] text-muted">{report.locationLabel}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* -- History ------------------------------------------------------- */}
      {progress && progress.history.length > 0 ? (
        <section className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 className="mb-4 text-[0.9375rem] font-semibold tracking-tight text-ink">
            History
          </h2>
          <Timeline
            entries={[...progress.history].reverse().map((entry) => ({
              id: entry.id,
              title: entry.note ? `${entry.stageName} — ${entry.note}` : entry.stageName,
              actor: entry.actor,
              timestamp: formatDateTime(entry.enteredAt),
              tone: entry.isTerminal ? "resolved" : "process",
            }))}
          />
        </section>
      ) : null}

      <div className="mt-6 space-y-6">
        <IssueDiscussion
          issueCode={issue.issueCode}
          currentOfficerId={officer.id}
          initialThreadId={thread}
          roster={roster}
          conversations={conversations.map((conversation) => ({
            ...conversation,
            lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
          }))}
        />

        <IssueClarifications
          issueCode={issue.issueCode}
          reports={reports.map((report) => ({
            reportId: report.reportId,
            title: report.title,
            locationLabel: report.locationLabel,
            createdAt: report.createdAt.toISOString(),
          }))}
          threads={threads.map((thread) => ({
            id: thread.id,
            reportId: thread.reportId,
            citizenName: thread.citizenName,
            status: thread.status,
            messageCount: thread.messageCount,
            unreadForOfficer: thread.unreadForOfficer,
          }))}
        />
      </div>
    </GovShell>
  );
}
