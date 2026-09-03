import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { SiteHeader } from "@/components/landing/site-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChartCard, Donut } from "@/components/ui/charts";
import { Meter, Table, TableShell, Td, Th } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import { getPublicPerformance } from "@/lib/civic/tracking";
import { MIN_ISSUES_TO_RANK, rankAuthorities, summarise } from "@/lib/gov/performance";

export const metadata: Metadata = { title: "Authority performance · CivicAI" };
export const dynamic = "force-dynamic";

/*
 * Public accountability. No account required, and nothing here identifies a
 * citizen or exposes an authority's internal working — only counts.
 *
 * The ranking maths is unchanged and lives in lib/gov/performance.ts; this
 * file is presentation. The one thing the presentation must get right is that
 * a rate never appears without its denominator: "90%" beside "18 of 20" is
 * accountability, "90%" alone is a number an authority can game by receiving
 * fewer complaints.
 */
export default async function PerformancePage() {
  const rows = rankAuthorities(await getPublicPerformance());
  const totals = summarise(rows);

  const ranked = rows.filter((row) => row.ranked);
  const unranked = rows.filter((row) => !row.ranked);

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-9 sm:px-8">
        <div className="max-w-2xl">
          <Badge tone="brand">Open data · updated continuously</Badge>
          <h1 className="mt-3 text-[1.875rem] font-bold leading-tight tracking-tight text-ink sm:text-[2.25rem]">
            Authority performance &amp; accountability
          </h1>
          <p className="mt-2 text-[1.0625rem] leading-relaxed text-muted">
            How every registered authority is handling the civic issues citizens actually
            reported to it.
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            className="mt-8"
            title="No authorities yet"
            body="Once an authority starts receiving and resolving reports, its record will be published here."
          />
        ) : (
          <>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Citizen reports" value={totals.citizenReports} hint="Received" />
              <StatCard
                label="Civic issues"
                value={totals.issues}
                hint="After AI grouping"
              />
              <StatCard
                label="Resolved"
                value={totals.resolved}
                hint={`of ${totals.issues} issues`}
                valueClassName="text-status-resolved"
              />
              <StatCard
                label="Resolution rate"
                value={`${totals.resolutionRate}%`}
                hint="Across all authorities"
                emphasis
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              <ChartCard title="Where every issue stands">
                <Donut
                  centerValue={totals.issues}
                  centerLabel={totals.issues === 1 ? "issue" : "issues"}
                  slices={[
                    {
                      label: "Resolved",
                      value: totals.resolved,
                      color: "var(--color-status-resolved)",
                    },
                    {
                      label: "In process",
                      value: totals.inProcess,
                      color: "var(--color-status-process)",
                    },
                    {
                      label: "Reported",
                      value: totals.reported,
                      color: "var(--color-status-reported)",
                    },
                  ]}
                />
              </ChartCard>

              {/*
                The methodology sits BESIDE the table, not buried under it. A
                ranking a citizen cannot interrogate is not accountability.
              */}
              <Card className="flex gap-3 border-civic-200 bg-civic-50 p-5">
                <Info className="mt-0.5 size-4.5 shrink-0 text-civic-700" aria-hidden="true" />
                <div className="text-[0.875rem] leading-relaxed text-civic-900/80">
                  <p className="text-[0.9375rem] font-bold text-civic-900">
                    Rankings measure performance relative to workload — not raw resolved
                    numbers.
                  </p>
                  <p className="mt-2">
                    An authority is <strong>not</strong> ranked by how many issues it
                    closed; that would simply reward being large. It is ranked on
                    resolution rate, adjusted for how much evidence sits behind that rate:
                    an authority with a handful of issues is pulled toward the national
                    average until it has a track record, so a body that has closed two
                    cases cannot outrank one that has closed hundreds.
                  </p>
                  <p className="mt-2">
                    An authority with fewer than {MIN_ISSUES_TO_RANK} issues is listed with
                    its real figures but is not placed — there is not yet enough to judge
                    it fairly.
                  </p>
                </div>
              </Card>
            </div>

            <h2 className="mt-8 text-[1.0625rem] font-semibold tracking-tight text-ink">
              Ranking
            </h2>

            <TableShell className="mt-3">
              <Table className="min-w-[46rem]">
                <thead>
                  <tr>
                    <Th className="w-14">Rank</Th>
                    <Th>Authority</Th>
                    <Th>Resolution rate</Th>
                    <Th numeric>Resolved</Th>
                    <Th numeric>Open</Th>
                    <Th numeric>Issues</Th>
                    <Th numeric>Reports</Th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((row) => (
                    <tr
                      key={row.authorityId}
                      className={row.rank === 1 ? "bg-civic-50" : undefined}
                    >
                      <Td>
                        <span
                          className={
                            row.rank === 1
                              ? "text-[1.0625rem] font-bold text-civic-700"
                              : "text-[1.0625rem] font-bold text-muted"
                          }
                        >
                          #{row.rank}
                        </span>
                      </Td>
                      <Td>
                        <span className="block font-semibold text-ink">
                          {row.authorityName}
                        </span>
                        <span className="font-mono text-[0.75rem] text-muted">
                          {row.authorityCode}
                        </span>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <Meter
                            value={row.resolutionRate}
                            tone={row.resolutionRate >= 75 ? "brand" : "process"}
                            className="max-w-[88px]"
                          />
                          <span className="shrink-0 font-semibold tabular-nums text-ink">
                            {row.resolutionRate}%
                          </span>
                        </span>
                        {/* The denominator, always. */}
                        <span className="mt-0.5 block text-[0.75rem] text-muted">
                          {row.resolved} of {row.totalIssues}
                        </span>
                      </Td>
                      <Td numeric>{row.resolved}</Td>
                      <Td numeric>{row.openIssues}</Td>
                      <Td numeric>{row.totalIssues}</Td>
                      <Td numeric className="text-muted">
                        {row.citizenReports}
                      </Td>
                    </tr>
                  ))}

                  {unranked.map((row) => (
                    <tr key={row.authorityId} className="bg-canvas/60">
                      <Td className="text-muted">—</Td>
                      <Td>
                        <span className="block font-semibold text-ink">
                          {row.authorityName}
                        </span>
                        <Badge className="mt-1">Not enough data to rank</Badge>
                      </Td>
                      <Td>
                        <span className="text-[0.8125rem] text-muted">
                          {row.resolved} of {row.totalIssues}
                        </span>
                      </Td>
                      <Td numeric>{row.resolved}</Td>
                      <Td numeric>{row.openIssues}</Td>
                      <Td numeric>{row.totalIssues}</Td>
                      <Td numeric className="text-muted">
                        {row.citizenReports}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableShell>

            <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">
              &ldquo;Resolved&rdquo; means the issue reached that department&rsquo;s own
              final stage. Each department defines what finished means for its work, so a
              road repair and a water main are judged by their own standards rather than a
              single platform-wide rule.
            </p>
          </>
        )}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-5 py-8 sm:px-8">
          <CivicAILogo />
          <p className="max-w-md text-[0.8125rem] leading-relaxed text-muted">
            Published without an account, because accountability that requires a login is
            not accountability.
          </p>
          <Link
            href="/"
            className="ms-auto text-[0.875rem] font-medium text-civic-700 hover:underline"
          >
            Back to CivicAI
          </Link>
        </div>
      </footer>
    </div>
  );
}
