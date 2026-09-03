import type { Metadata } from "next";
import { Layers } from "lucide-react";

import { GovShell } from "@/components/gov/gov-shell";
import { Card } from "@/components/ui/card";
import { BarChart, ChartCard, Donut, RankedBars } from "@/components/ui/charts";
import { Meter, Table, TableShell, Td, Th } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { requireOfficer } from "@/lib/gov/session";
import { getDepartmentLoad, getGovOverview, getWeeklyReports } from "@/lib/gov/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Analytics · CivicAI Government" };

/*
 * Operational analytics.
 *
 * Four charts, not twelve. The brief asked explicitly not to overload this
 * screen, and the restraint is the point: a page of twenty charts is read as
 * wallpaper, and the two figures that would actually change a decision get
 * lost among eighteen that would not.
 *
 * Every rate on this page is shown against its DENOMINATOR. A department that
 * closed 9 of 10 is not outperformed by one that closed 40 of 100, and a bare
 * percentage invites exactly that mistake — which is also the ranking rule the
 * public performance page is built on.
 */
export default async function GovAnalyticsPage() {
  const { officer } = await requireOfficer();

  const [overview, weekly, load] = await Promise.all([
    getGovOverview(officer),
    getWeeklyReports(officer, 8),
    getDepartmentLoad(officer),
  ]);

  const peak = Math.max(...weekly.map((week) => week.value), 0);

  const resolutionRate =
    overview.issues > 0 ? Math.round((overview.resolved / overview.issues) * 100) : 0;

  // Reports per issue: how much duplicate load the grouping agent absorbs.
  const perIssue =
    overview.issues > 0 ? (overview.reports / overview.issues).toFixed(1) : "0";

  const busiest = load[0];

  return (
    <GovShell officer={officer} backHref="/gov">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
          Analytics
        </h1>
        <p className="mt-1 text-[0.9375rem] text-muted">
          {officer.deptName ?? officer.orgName ?? "Every organisation on CivicAI"}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total reports" value={overview.reports} hint="All time" />
          <StatCard
            label="Civic issues"
            value={overview.issues}
            hint={`${perIssue} reports each`}
            icon={Layers}
          />
          <StatCard
            label="Resolution rate"
            value={`${resolutionRate}%`}
            hint={`${overview.resolved} of ${overview.issues} closed`}
            emphasis
          />
          <StatCard
            label="In process"
            value={overview.inProcess}
            hint="Actively worked"
            valueClassName="text-status-process"
          />
          <StatCard
            label="Awaiting routing"
            value={overview.unrouted}
            hint="No department yet"
            valueClassName="text-status-reported"
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <ChartCard title="Reports received" subtitle="Last 8 weeks">
            {peak === 0 ? (
              <p className="py-10 text-center text-[0.875rem] text-muted">
                No reports in this period yet.
              </p>
            ) : (
              <BarChart
                data={weekly.map((week) => ({ ...week, emphasis: week.value === peak }))}
              />
            )}
          </ChartCard>

          <ChartCard title="Status distribution">
            {overview.issues === 0 ? (
              <p className="py-10 text-center text-[0.875rem] text-muted">No issues yet.</p>
            ) : (
              <Donut
                centerValue={`${resolutionRate}%`}
                centerLabel="resolved"
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

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Workload by department" subtitle="Reports carried">
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
                  } carried`,
                }))}
              />
            )}
          </ChartCard>

          <Card className="p-5">
            <h3 className="mb-1 text-[0.9375rem] font-semibold tracking-tight text-ink">
              Resolution against workload
            </h3>
            <p className="mb-4 text-[0.8125rem] text-muted">
              A rate on its own flatters a small queue. The counts are shown beside it.
            </p>

            {load.length === 0 ? (
              <p className="py-8 text-center text-[0.875rem] text-muted">
                Nothing to compare yet.
              </p>
            ) : (
              <TableShell className="border-0">
                <Table>
                  <thead>
                    <tr>
                      <Th className="px-0">Department</Th>
                      <Th className="px-0">Resolved</Th>
                      <Th numeric className="px-0">
                        Issues
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {load.map((department) => {
                      const rate =
                        department.issues > 0
                          ? Math.round((department.resolved / department.issues) * 100)
                          : 0;

                      return (
                        <tr key={department.deptId}>
                          <Td className="px-0">
                            <span className="font-medium text-ink">{department.name}</span>
                          </Td>
                          <Td className="px-0">
                            <span className="flex items-center gap-2.5">
                              <Meter
                                value={rate}
                                tone={rate >= 60 ? "brand" : "process"}
                                className="max-w-[90px]"
                              />
                              <span className="shrink-0 text-[0.8125rem] font-semibold tabular-nums text-ink">
                                {rate}%
                              </span>
                            </span>
                            <span className="mt-0.5 block text-[0.75rem] text-muted">
                              {department.resolved} of {department.issues}
                            </span>
                          </Td>
                          <Td numeric className="px-0 text-muted">
                            {department.issues}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableShell>
            )}

            {busiest ? (
              <p className="mt-4 border-t border-line pt-3 text-[0.8125rem] leading-relaxed text-muted">
                <strong className="font-semibold text-ink">{busiest.name}</strong> carries the
                most, at {busiest.reports} reports across {busiest.issues}{" "}
                {busiest.issues === 1 ? "issue" : "issues"}
                {busiest.open > 0 ? `, ${busiest.open} still open` : ""}.
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </GovShell>
  );
}
