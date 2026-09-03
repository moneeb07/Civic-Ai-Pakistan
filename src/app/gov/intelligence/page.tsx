import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Layers, Route, Sparkles, Users } from "lucide-react";

import { GovShell } from "@/components/gov/gov-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireOfficer } from "@/lib/gov/session";
import { getGovOverview } from "@/lib/gov/stats";
import { listGroupedExamples } from "@/lib/gov/grouping-examples";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "AI grouping · CivicAI Government" };

/*
 * How CivicAI turns a pile of reports into a list of problems.
 *
 * This screen exists because the grouping is the platform's least obvious and
 * most valuable behaviour, and an officer who does not trust it will work
 * around it. So it shows the real pipeline on real data — the officer's own
 * issues, their own duplicate counts, their own borderline matches — rather
 * than explaining the concept in the abstract.
 *
 * The honesty rule it is built on: an uncertain match is labelled uncertain.
 * Anything the similarity agent was not confident about is grouped
 * PROVISIONALLY and says so, and an officer can split it back out. A system
 * that quietly merged two different potholes would be worse than one that
 * never grouped at all, because nobody would be able to tell.
 */

const OUTCOMES = [
  {
    key: "group",
    label: "Group",
    threshold: "confidence ≥ 0.85",
    body: "Same problem, same place. Linked to the existing issue, and its report count rises.",
    tone: "resolved" as const,
  },
  {
    key: "review",
    label: "Needs review",
    threshold: "0.60 – 0.85",
    body: "Plausible but not certain. Grouped provisionally, shown as unconfirmed, and an officer can split it back out.",
    tone: "process" as const,
  },
  {
    key: "new",
    label: "New issue",
    threshold: "< 0.60",
    body: "Nothing matches. A new issue code is minted and routed on its own.",
    tone: "reported" as const,
  },
];

const TONE_CLASS = {
  resolved: "border-status-resolved-line bg-status-resolved-bg text-status-resolved",
  process: "border-status-process-line bg-status-process-bg text-status-process",
  reported: "border-status-reported-line bg-status-reported-bg text-status-reported",
};

export default async function IntelligencePage() {
  const { officer } = await requireOfficer();

  const [overview, examples] = await Promise.all([
    getGovOverview(officer),
    listGroupedExamples(officer, 3),
  ]);

  return (
    <GovShell officer={officer} backHref="/gov">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
          How reports become issues
        </h1>
        <p className="mt-1 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">
          Two agents run on every report that arrives. One decides which department owns
          it; the other decides whether it is a new problem or another voice on one you
          already have.
        </p>

        {/* -- The pipeline, on this officer's real numbers ---------------- */}
        <div className="mt-6 grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          <Card className="flex flex-col justify-center p-5 text-center">
            <p className="text-[2.25rem] font-bold leading-none tracking-tight tabular-nums text-ink">
              {overview.reports}
            </p>
            <p className="mt-1.5 text-[0.8125rem] text-muted">Citizen reports</p>
          </Card>

          <Arrow />

          <Card className="flex flex-col justify-center border-civic-900 bg-civic-900 p-5 text-center text-white">
            <Route className="mx-auto size-5 text-civic-200" aria-hidden="true" />
            <p className="mt-2 text-[0.9375rem] font-bold">Routing agent</p>
            <p className="mt-0.5 text-[0.75rem] text-white/60">Which department owns this</p>
          </Card>

          <Arrow />

          <Card className="flex flex-col justify-center border-civic-900 bg-civic-900 p-5 text-center text-white">
            <Layers className="mx-auto size-5 text-civic-200" aria-hidden="true" />
            <p className="mt-2 text-[0.9375rem] font-bold">Similarity agent</p>
            <p className="mt-0.5 text-[0.75rem] text-white/60">New problem, or another voice</p>
          </Card>

          <Arrow />

          <Card className="flex flex-col justify-center border-civic-600 bg-civic-50 p-5 text-center">
            <p className="text-[2.25rem] font-bold leading-none tracking-tight tabular-nums text-civic-700">
              {overview.issues}
            </p>
            <p className="mt-1.5 text-[0.8125rem] font-medium text-civic-900">
              Real-world issues
            </p>
          </Card>
        </div>

        {overview.grouped > 0 ? (
          <p className="mt-3 rounded-[var(--radius-field)] border border-civic-200 bg-civic-50 px-4 py-3 text-[0.875rem] leading-relaxed text-civic-900">
            <strong className="font-semibold">
              {overview.grouped} duplicate {overview.grouped === 1 ? "report" : "reports"}
            </strong>{" "}
            were folded into an issue somebody had already raised. That is{" "}
            {overview.grouped} pieces of work your departments did not have to triage
            separately — and every one of those citizens still has their own tracking code.
          </p>
        ) : null}

        {/* -- What the agent decides -------------------------------------- */}
        <h2 className="mt-8 text-[1.0625rem] font-semibold tracking-tight text-ink">
          The three outcomes
        </h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {OUTCOMES.map((outcome) => (
            <Card key={outcome.key} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.75rem] font-semibold ${TONE_CLASS[outcome.tone]}`}
                >
                  {outcome.label}
                </span>
                <span className="font-mono text-[0.75rem] text-muted">
                  {outcome.threshold}
                </span>
              </div>
              <p className="mt-2.5 text-[0.875rem] leading-relaxed text-muted">{outcome.body}</p>
            </Card>
          ))}
        </div>

        {/* -- Worked examples, from real data ----------------------------- */}
        <h2 className="mt-8 text-[1.0625rem] font-semibold tracking-tight text-ink">
          Grouped in your scope
        </h2>
        <p className="mt-1 text-[0.875rem] text-muted">
          Issues where more than one citizen reported the same thing.
        </p>

        {examples.length === 0 ? (
          <EmptyState
            className="mt-3"
            icon={Sparkles}
            title="Nothing grouped yet"
            body="When two people report the same problem, the issue they were folded into will appear here with the agent's reasoning."
          />
        ) : (
          <ul className="mt-3 grid gap-3">
            {examples.map((example) => (
              <li key={example.issueId}>
                <Card className="p-5">
                  <div className="grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                    {/* The reports that went in. */}
                    <ul className="grid gap-2">
                      {example.reports.map((report) => (
                        <li
                          key={report.reportId}
                          className={`rounded-[12px] border border-line border-s-[3px] bg-canvas px-3 py-2 ${
                            report.matchStatus === "needs_review"
                              ? "border-s-status-process"
                              : "border-s-civic-500"
                          }`}
                        >
                          <p className="truncate text-[0.8125rem] font-medium text-ink">
                            {report.title ?? "Untitled report"}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.75rem] text-muted">
                            {report.matchStatus === "first_report" ? (
                              <Badge>First report</Badge>
                            ) : report.matchStatus === "needs_review" ? (
                              <span className="font-semibold text-status-process">
                                Unconfirmed match
                              </span>
                            ) : (
                              <span className="font-semibold text-status-resolved">
                                Auto-grouped
                              </span>
                            )}
                            {report.similarity !== null
                              ? `similarity ${report.similarity.toFixed(2)}`
                              : null}
                          </p>
                        </li>
                      ))}
                    </ul>

                    <div className="hidden justify-center lg:flex">
                      <Users className="size-5 text-civic-500" aria-hidden="true" />
                    </div>

                    {/* The issue they became. */}
                    <Link
                      href={`/gov/issues/${example.issueCode}`}
                      className="group block rounded-[var(--radius-card)] border border-civic-200 bg-civic-50 p-4 transition-colors hover:border-civic-500"
                    >
                      <span className="font-mono text-[0.8125rem] font-bold text-civic-700">
                        {example.issueCode}
                      </span>
                      <span className="mt-1 block text-[0.9375rem] font-semibold leading-snug text-ink">
                        {example.title}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone="brand">{example.reportCount} reports</Badge>
                        {example.needsReview > 0 ? (
                          <span className="inline-flex items-center rounded-full border border-status-process-line bg-status-process-bg px-2.5 py-0.5 text-[0.75rem] font-semibold text-status-process">
                            {example.needsReview} unconfirmed
                          </span>
                        ) : null}
                        <ArrowRight
                          className="ms-auto size-4 text-civic-700 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </span>
                    </Link>
                  </div>

                  {example.rationale ? (
                    <p className="mt-4 border-t border-line pt-3 text-[0.8125rem] leading-relaxed text-muted">
                      <span className="font-semibold text-ink">Why this department: </span>
                      {example.rationale}
                    </p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GovShell>
  );
}

/** Connector between pipeline stages. Horizontal on desktop, vertical stacked. */
function Arrow() {
  return (
    <div className="flex items-center justify-center" aria-hidden="true">
      <ArrowRight className="size-4 rotate-90 text-line-strong lg:rotate-0" />
    </div>
  );
}
