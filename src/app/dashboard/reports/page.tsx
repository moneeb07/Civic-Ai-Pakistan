import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { TrackedReportCard } from "@/components/civic/tracked-report-card";
import { CitizenReportSearch } from "@/components/civic/citizen-report-search";
import { requireSession } from "@/lib/session";
import { getCitizenSummary, listCitizenReports } from "@/lib/civic/tracking";

export const metadata: Metadata = { title: "My reports" };
export const dynamic = "force-dynamic";

/*
 * The citizen's own reports and what became of them.
 *
 * Everything here is scoped to the signed-in user at the database level, so
 * this page cannot show another citizen's report even if asked to.
 */
export default async function MyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSession();
  const { q } = await searchParams;

  const [reports, summary] = await Promise.all([
    listCitizenReports(session.user.id),
    getCitizenSummary(session.user.id),
  ]);

  const term = q?.trim().toLowerCase() ?? "";
  const visible = term
    ? reports.filter((row) =>
        [
          row.issue?.issueCode,
          row.issue?.title,
          row.title,
          row.locationLabel,
          row.category,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term)),
      )
    : reports;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
      <header>
        <h1 className="text-[1.375rem] font-bold tracking-tight text-ink">My reports</h1>
        <p className="mt-1 text-[0.875rem] text-muted">
          Track what happened to every problem you reported.
        </p>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <Stat label="Reported" value={summary.reported} tone="red" />
        <Stat label="In process" value={summary.inProcess} tone="amber" />
        <Stat label="Resolved" value={summary.resolved} tone="green" />
      </div>

      <div className="mt-5">
        <CitizenReportSearch />
      </div>

      <div className="mt-4 space-y-3">
        {visible.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-line-strong bg-surface p-8 text-center">
            <FileText className="mx-auto size-6 text-muted" aria-hidden="true" />
            <p className="mt-2 text-[0.9375rem] font-semibold text-ink">
              {term ? "Nothing matched that search" : "No reports yet"}
            </p>
            <p className="mt-1 text-[0.875rem] text-muted">
              {term
                ? "Try an Issue ID, a place, or part of the title."
                : "When you report a problem it will appear here with its progress."}
            </p>
          </div>
        ) : (
          visible.map((row) => <TrackedReportCard key={row.reportId} report={row} />)
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green";
}) {
  const styles = {
    red: "border-danger/20 bg-danger-bg text-danger",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    green: "border-civic-200 bg-civic-50 text-civic-800",
  }[tone];

  return (
    <div className={`rounded-[16px] border p-3 text-center ${styles}`}>
      <p className="text-[1.375rem] font-bold leading-none">{value}</p>
      <p className="mt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]">
        {label}
      </p>
    </div>
  );
}
