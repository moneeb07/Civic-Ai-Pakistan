import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";

import { ResolutionDonut } from "@/components/civic/resolution-donut";
import { CivicAILogo } from "@/components/brand/civicai-logo";
import { getPublicPerformance } from "@/lib/civic/tracking";
import {
  MIN_ISSUES_TO_RANK,
  rankAuthorities,
  summarise,
} from "@/lib/authority/performance";

export const metadata: Metadata = { title: "Authority performance" };
export const dynamic = "force-dynamic";

/*
 * Public accountability. No account required, and nothing here identifies a
 * citizen or exposes an authority's internal working — only counts.
 */
export default async function PerformancePage() {
  const rows = rankAuthorities(await getPublicPerformance());
  const totals = summarise(rows);

  const ranked = rows.filter((row) => row.ranked);
  const unranked = rows.filter((row) => !row.ranked);

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-3">
          <Link href="/" aria-label="CivicAI home">
            <CivicAILogo className="h-6 w-auto" />
          </Link>
          <span className="flex-1" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-civic-700 hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-7">
        <h1 className="text-[1.5rem] font-bold tracking-tight text-ink">
          Authority performance
        </h1>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">
          How each authority is handling the civic issues citizens have reported.
        </p>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Citizen reports" value={totals.citizenReports} />
          <Tile label="Civic issues" value={totals.issues} tone="primary" />
          <Tile label="Resolved" value={totals.resolved} tone="green" />
          <Tile label="Resolution rate" value={`${totals.resolutionRate}%`} />
        </section>

        <section className="mt-4 rounded-[20px] border border-line bg-surface p-5">
          <h2 className="text-[1rem] font-semibold text-ink">Overall</h2>
          <div className="mt-4">
            <ResolutionDonut
              reported={totals.reported}
              inProcess={totals.inProcess}
              resolved={totals.resolved}
            />
          </div>
        </section>

        {/*
          The methodology is stated before the table, not buried under it. A
          ranking a citizen cannot interrogate is not accountability.
        */}
        <section className="mt-4 flex items-start gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-civic-700" aria-hidden="true" />
          <div className="text-[0.8125rem] leading-relaxed text-muted">
            <p className="font-semibold text-ink">How this ranking works</p>
            <p className="mt-1">
              Authorities are <strong>not</strong> ranked by how many issues they
              resolved — that would simply reward being large. They are ranked on
              resolution rate, adjusted for how much evidence there is behind it: an
              authority with a handful of issues is pulled toward the national
              average until it has a track record, so a body that has closed two
              cases cannot outrank one that has closed hundreds.
            </p>
            <p className="mt-1">
              An authority with fewer than {MIN_ISSUES_TO_RANK} issues is shown with
              its real figures but is not placed in the table — there is not yet
              enough to judge fairly.
            </p>
          </div>
        </section>

        <section className="mt-4">
          <h2 className="mb-3 text-[1rem] font-semibold text-ink">Ranking</h2>

          <div className="overflow-x-auto rounded-[20px] border border-line bg-surface">
            <table className="w-full min-w-[42rem] text-start">
              <thead>
                <tr className="border-b border-line text-[0.6875rem] uppercase tracking-[0.1em] text-muted">
                  <Th className="w-12">#</Th>
                  <Th>Authority</Th>
                  <Th align="end">Reports</Th>
                  <Th align="end">Issues</Th>
                  <Th align="end">Open</Th>
                  <Th align="end">Resolved</Th>
                  <Th align="end">Rate</Th>
                  <Th align="end">Score</Th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row) => (
                  <tr key={row.authorityId} className="border-b border-line last:border-0">
                    <Td className="font-bold text-civic-700">{row.rank}</Td>
                    <Td>
                      <span className="font-semibold text-ink">{row.authorityName}</span>
                      <span className="ms-2 font-mono text-[0.6875rem] text-muted">
                        {row.authorityCode}
                      </span>
                    </Td>
                    <Td align="end">{row.citizenReports}</Td>
                    <Td align="end">{row.totalIssues}</Td>
                    <Td align="end">{row.openIssues}</Td>
                    <Td align="end">{row.resolved}</Td>
                    <Td align="end" className="font-semibold text-ink">
                      {row.resolutionRate}%
                    </Td>
                    <Td align="end" className="text-muted">
                      {row.rankingScore}
                    </Td>
                  </tr>
                ))}

                {unranked.map((row) => (
                  <tr
                    key={row.authorityId}
                    className="border-b border-line bg-canvas/60 last:border-0"
                  >
                    <Td className="text-muted">—</Td>
                    <Td>
                      <span className="font-semibold text-ink">{row.authorityName}</span>
                      <span className="ms-2 rounded-full bg-canvas px-2 py-0.5 text-[0.625rem] font-semibold text-muted">
                        Not enough data to rank
                      </span>
                    </Td>
                    <Td align="end">{row.citizenReports}</Td>
                    <Td align="end">{row.totalIssues}</Td>
                    <Td align="end">{row.openIssues}</Td>
                    <Td align="end">{row.resolved}</Td>
                    <Td align="end" className="font-semibold text-ink">
                      {row.resolutionRate}%
                    </Td>
                    <Td align="end" className="text-muted">
                      —
                    </Td>
                  </tr>
                ))}

                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[0.875rem] text-muted">
                      No authorities are configured yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.authorityId} className="rounded-[20px] border border-line bg-surface p-5">
              <h3 className="text-[0.9375rem] font-semibold text-ink">{row.authorityName}</h3>
              <div className="mt-3">
                <ResolutionDonut
                  reported={row.reported}
                  inProcess={row.inProcess}
                  resolved={row.resolved}
                  size={132}
                />
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "primary" | "green";
}) {
  const styles =
    tone === "primary"
      ? "border-civic-200 bg-civic-50"
      : tone === "green"
        ? "border-civic-200 bg-civic-50/60"
        : "border-line bg-surface";

  return (
    <div className={`rounded-[18px] border p-4 ${styles}`}>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className="mt-1.5 text-[1.75rem] font-bold leading-none text-ink">{value}</p>
    </div>
  );
}

function Th({
  children,
  align = "start",
  className = "",
}: {
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <th className={`px-4 py-2.5 text-${align} font-semibold ${className}`}>{children}</th>
  );
}

function Td({
  children,
  align = "start",
  className = "",
}: {
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <td className={`px-4 py-3 text-[0.875rem] text-${align} ${className}`}>{children}</td>
  );
}
