import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Layers, ListChecks, Sparkles, TriangleAlert } from "lucide-react";

import { GovShell } from "@/components/gov/gov-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BarChart, ChartCard, Donut, RankedBars } from "@/components/ui/charts";
import { EmptyState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { formatDateTime } from "@/lib/civic/format-date";
import { requireOfficer } from "@/lib/gov/session";
import {
  getDepartmentLoad,
  getGovOverview,
  getRecentActivity,
  getWeeklyReports,
} from "@/lib/gov/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Overview · CivicAI Government" };

/*
 * The operations overview.
 *
 * This route used to redirect straight to a role-specific page. It is now a
 * real dashboard for every role, scoped to what that officer can see — a
 * platform admin gets the whole platform, an org head their organisation, a
 * department member their department. The role-specific screens are all still
 * reachable from the sidebar; they were just a poor first thing to land on,
 * because none of them answered "how are we doing".
 *
 * The headline is deliberately a PAIR of numbers rather than one: reports
 * received against issues that actually exist. That ratio is the single most
 * important fact about this platform, and burying it would let a department
 * believe it has a hundred jobs when it has sixteen.
 */
export default async function GovOverviewPage() {
  const { officer } = await requireOfficer();

  const [overview, weekly, load, activity] = await Promise.all([
    getGovOverview(officer),
    getWeeklyReports(officer),
    getDepartmentLoad(officer),
    getRecentActivity(officer),
  ]);

  const peak = Math.max(...weekly.map((week) => week.value), 0);

  return (
    <GovShell officer={officer}>
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
              Operations overview
            </h1>
            <p className="mt-1 text-[0.9375rem] text-muted">
              {officer.deptName ?? officer.orgName ?? "Every organisation on CivicAI"}
            </p>
          </div>

          {overview.unrouted > 0 ? (
            <Link
              href="/gov/work"
              className="inline-flex items-center gap-2 rounded-[var(--radius-field)] border border-status-process-line bg-status-process-bg px-4 py-2.5 text-[0.875rem] font-semibold text-status-process transition-colors hover:brightness-95"
            >
              <TriangleAlert className="size-4" aria-hidden="true" />
              {overview.unrouted} awaiting routing
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {/* -- The ratio that defines the platform ------------------------- */}
        <Card className="mt-5 overflow-hidden border-civic-200 p-0">
          <div className="grid gap-px bg-civic-200 sm:grid-cols-[1fr_auto_1fr]">
            <div className="bg-civic-50 px-6 py-5">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-civic-700">
                Citizen reports received
              </p>
              <p className="mt-1 text-[2.5rem] font-bold leading-none tracking-tight tabular-nums text-ink">
                {overview.reports}
              </p>
            </div>

            <div className="flex items-center justify-center bg-civic-50 px-6 py-3">
              <span className="flex items-center gap-2 text-[0.8125rem] font-semibold text-civic-700">
                <Sparkles className="size-4" aria-hidden="true" />
                AI grouping
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </div>

            <div className="bg-civic-600 px-6 py-5 text-white">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-white/70">
                Real-world civic issues
              </p>
              <p className="mt-1 text-[2.5rem] font-bold leading-none tracking-tight tabular-nums">
                {overview.issues}
              </p>
            </div>
          </div>

          <p className="border-t border-civic-200 bg-surface px-6 py-3 text-[0.8125rem] text-muted">
            <strong className="font-semibold text-ink">
              {overview.reports} reports is not {overview.reports} problems.
            </strong>{" "}
            {overview.grouped > 0
              ? `${overview.grouped} duplicate reports were folded into an issue somebody else had already raised — every reporter still keeps their own tracking code.`
              : "Duplicate reports about one problem are folded together automatically, so a department sees one job rather than a queue of the same complaint."}
          </p>
        </Card>

        {/* -- Lifecycle --------------------------------------------------- */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Reported"
            value={overview.reported}
            hint="No department yet"
            valueClassName="text-status-reported"
          />
          <StatCard
            label="In process"
            value={overview.inProcess}
            hint="Being worked on"
            valueClassName="text-status-process"
          />
          <StatCard
            label="Resolved"
            value={overview.resolved}
            hint="Reached a final stage"
            valueClassName="text-status-resolved"
          />
          <StatCard
            label="Grouped by AI"
            value={overview.grouped}
            hint={`of ${overview.reports} reports`}
            icon={Layers}
          />
        </div>

        {/* -- Charts ------------------------------------------------------ */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <ChartCard title="Reports received" subtitle="Last 8 weeks">
            {peak === 0 ? (
              <p className="py-10 text-center text-[0.875rem] text-muted">
                No reports in this period yet.
              </p>
            ) : (
              <BarChart
                data={weekly.map((week) => ({
                  ...week,
                  emphasis: week.value === peak,
                }))}
              />
            )}
          </ChartCard>

          <ChartCard title="Issue status">
            {overview.issues === 0 ? (
              <p className="py-10 text-center text-[0.875rem] text-muted">
                No issues yet.
              </p>
            ) : (
              <Donut
                centerValue={overview.issues}
                centerLabel={overview.issues === 1 ? "issue" : "issues"}
                slices={[
                  {
                    label: "Resolved",
                    value: overview.resolved,
                    color: "var(--color-status-resolved)",
                  },
                  {
                    label: "In process",
                    value: overview.inProcess,
                    color: "var(--color-status-process)",
                  },
                  {
                    label: "Reported",
                    value: overview.reported,
                    color: "var(--color-status-reported)",
                  },
                ]}
              />
            )}
          </ChartCard>
        </div>

        {/* -- Workload and activity --------------------------------------- */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Department workload" subtitle="By reports carried">
            {load.length === 0 ? (
              <p className="py-8 text-center text-[0.875rem] text-muted">
                No issues routed to a department yet.
              </p>
            ) : (
              <RankedBars
                unit="reports"
                data={load.map((department) => ({
                  label: department.name,
                  value: department.reports,
                  caption: `${department.issues} ${
                    department.issues === 1 ? "issue" : "issues"
                  } · ${department.resolved} resolved · ${department.open} open`,
                }))}
              />
            )}
          </ChartCard>

          <Card className="p-5">
            <div className="mb-4 flex items-baseline gap-3">
              <h3 className="text-[0.9375rem] font-semibold tracking-tight text-ink">
                Recent activity
              </h3>
              <Link
                href="/gov/notifications"
                className="ms-auto text-[0.8125rem] font-medium text-civic-700 hover:underline"
              >
                All discussions
              </Link>
            </div>

            {activity.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="Nothing yet"
                body="Department discussion on an issue appears here as it happens."
              />
            ) : (
              <ul className="space-y-3.5">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <Avatar name={entry.actor ?? "CivicAI"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.8125rem] leading-snug text-ink">
                        <span className="font-semibold">{entry.actor ?? "CivicAI"}</span>{" "}
                        {entry.title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.75rem] text-muted">
                        {entry.issueCode ? (
                          <Link
                            href={`/gov/issues/${entry.issueCode}`}
                            className="font-mono font-semibold text-civic-700 hover:underline"
                          >
                            {entry.issueCode}
                          </Link>
                        ) : null}
                        {formatDateTime(entry.at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* -- Where to go next -------------------------------------------- */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { href: "/gov/work", label: "Work the queue", detail: "Issues assigned to you" },
            { href: "/gov/analytics", label: "Analytics", detail: "Trends and performance" },
            {
              href: "/gov/notifications",
              label: "Discussions",
              detail: "Mentions and replies",
            },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 transition-colors hover:border-civic-200"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-ink">
                  {link.label}
                </span>
                <span className="block text-[0.8125rem] text-muted">{link.detail}</span>
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>

        <p className="mt-6 text-[0.75rem] text-muted">
          <Badge tone="brand">Scope</Badge>{" "}
          Every figure on this page is limited to what your role may see.
        </p>
      </div>
    </GovShell>
  );
}
