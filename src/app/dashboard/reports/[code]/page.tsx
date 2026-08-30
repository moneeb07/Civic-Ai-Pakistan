import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Users } from "lucide-react";

import { formatDateTime } from "@/lib/civic/format-date";
import { StatusProgress } from "@/components/civic/status-progress";
import { requireSession } from "@/lib/session";
import { getCitizenIssue } from "@/lib/civic/tracking";
import { categoryLabel, STATUS_LABELS, normaliseIssueCode } from "@/lib/authority/schema";

export const dynamic = "force-dynamic";

/*
 * The citizen's view of a civic issue they reported.
 *
 * A deliberately smaller page than the authority workspace: status, timeline,
 * how many people reported the same problem, and who is handling it. No
 * discussions, no member names, no internal notes — that is the department's
 * working, not public record.
 */
export default async function CitizenIssuePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const session = await requireSession();
  const { code } = await params;

  /*
   * Scoped to this citizen's own reports. Issue codes are sequential, so
   * without the ownership check anyone could walk the range and read every
   * civic issue in the country.
   */
  const issue = await getCitizenIssue(
    normaliseIssueCode(decodeURIComponent(code)),
    session.user.id,
  );
  if (!issue) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
      <Link
        href="/dashboard/reports"
        className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-civic-700 hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        My reports
      </Link>

      <header className="mt-4">
        <span className="font-mono text-[0.875rem] font-bold tracking-tight text-civic-700">
          {issue.issueCode}
        </span>
        <h1 className="mt-1.5 text-[1.25rem] font-bold leading-snug tracking-tight text-ink">
          {issue.title}
        </h1>
        {issue.description ? (
          <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
            {issue.description}
          </p>
        ) : null}
      </header>

      <section className="mt-6 rounded-[20px] border border-line bg-surface p-5">
        <StatusProgress status={issue.status} />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Fact label="Category">{categoryLabel(issue.category)}</Fact>
          <Fact label="Handled by">
            {issue.departmentName
              ? `${issue.departmentName} · ${issue.authorityName}`
              : "Awaiting assignment"}
          </Fact>
          <Fact label="Location" icon={<MapPin className="size-3" />}>
            {issue.locationLabel ?? "Not recorded"}
          </Fact>
          <Fact label="Citizens reporting" icon={<Users className="size-3" />}>
            {issue.reportCount}
          </Fact>
        </div>
      </section>

      {issue.reportCount > 1 ? (
        <p className="mt-4 rounded-[16px] border border-civic-200 bg-civic-50 px-4 py-3 text-[0.8125rem] leading-relaxed text-civic-900">
          <span className="font-semibold">You are not the only one.</span>{" "}
          {issue.reportCount} citizens reported this same problem. CivicAI grouped
          those reports into one civic issue so the department sees the full scale
          of it rather than {issue.reportCount} separate complaints.
        </p>
      ) : null}

      <section className="mt-6">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">
          Progress
        </h2>
        <ol className="mt-3 space-y-3">
          {issue.timeline.map((entry, index) => (
            <li key={index} className="border-s-2 border-line ps-3">
              <p className="text-[0.875rem] font-medium text-ink">
                {STATUS_LABELS[entry.status] ?? entry.status}
              </p>
              <p className="text-[0.75rem] text-muted">{formatDateTime(entry.at)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Fact({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-[0.875rem] font-medium text-ink">{children}</p>
    </div>
  );
}
