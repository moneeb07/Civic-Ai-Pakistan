import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Camera,
  Droplets,
  FileText,
  Lightbulb,
  MessagesSquare,
  Mic,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { CitizenShell } from "@/components/dashboard/citizen-shell";
import { StatusProgress } from "@/components/civic/status-progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardEyebrow } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate } from "@/lib/civic/format-date";
import { getCitizenSummary, listCitizenReports } from "@/lib/civic/tracking";
import { listThreadsForCitizen } from "@/lib/gov/clarification";
import { getDictionary } from "@/lib/i18n";
import { getCitizenProfile } from "@/lib/profile";
import { requireSession } from "@/lib/session";
import { resolveLanding } from "@/lib/civic/landing";

const t = getDictionary();

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dashboard · CivicAI" };

function greeting(): string {
  // Pinned to Pakistan Standard Time so the server and the browser agree —
  // an unpinned hour produced "Good evening" beside a morning timestamp.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Karachi",
    }).format(new Date()),
  );

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const COMMON_ISSUES = [
  { icon: TriangleAlert, label: t.dashboard.potholes },
  { icon: Trash2, label: t.dashboard.garbage },
  { icon: Lightbulb, label: t.dashboard.streetLight },
  { icon: Droplets, label: t.dashboard.waterLeakage },
];

/*
 * The citizen's home.
 *
 * Reordered around one question: what has happened to the things I reported.
 * The previous version led with three ways to file a NEW report and pushed
 * existing ones behind a link — which is the right emphasis on day one and the
 * wrong one every day after. Now the summary and the live reports come first,
 * and reporting is a persistent action in the sidebar and the header.
 */
export default async function DashboardPage() {
  const session = await requireSession();

  /*
   * Registration must be finished before the dashboard means anything.
   * Someone who is BOTH a citizen and a department member stays here: this is
   * the account they registered, and they get a link across instead.
   */
  const landing = await resolveLanding(session.user.id);
  if (landing.redirectTo) redirect(landing.redirectTo);

  const [profile, summary, reports, threads] = await Promise.all([
    getCitizenProfile(session.user.id),
    getCitizenSummary(session.user.id),
    listCitizenReports(session.user.id),
    listThreadsForCitizen(session.user.id),
  ]);

  const awaitingReply = threads.filter((thread) => thread.unreadForCitizen > 0);
  const fullName = profile?.fullName ?? session.user.name;
  const firstName = fullName.split(" ")[0];

  // Newest first, and only the handful worth showing on a summary screen.
  const recent = reports.slice(0, 5);

  return (
    <CitizenShell
      name={fullName}
      subtitle={profile?.city ? `${profile.city} · Citizen` : "Citizen"}
      unreadMessages={awaitingReply.length}
    >
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-1 text-[0.9375rem] text-muted">{t.dashboard.prompt}</p>

        {/*
          A department waiting on an answer is the one thing here that blocks
          somebody else's work, so it sits above everything rather than being
          left to be discovered in a tab.
        */}
        {awaitingReply.length > 0 ? (
          <Link
            href="/dashboard/messages"
            className="mt-5 flex items-center gap-3 rounded-[var(--radius-card)] border border-civic-200 bg-civic-50 px-4 py-3.5 transition-colors hover:border-civic-500 hover:bg-civic-100"
          >
            <MessagesSquare className="size-5 shrink-0 text-civic-700" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold text-ink">
                {awaitingReply.length === 1
                  ? "A department has a question for you"
                  : `${awaitingReply.length} departments have questions for you`}
              </span>
              <span className="mt-0.5 block text-[0.8125rem] text-muted">
                Answering helps them fix it faster.
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-civic-700" aria-hidden="true" />
          </Link>
        ) : null}

        {/* -- The summary ------------------------------------------------ */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="My reports"
            value={summary.total}
            hint={summary.drafts > 0 ? `${summary.drafts} still a draft` : "All submitted"}
            icon={FileText}
          />
          <StatCard
            label="Reported"
            value={summary.reported}
            hint="Awaiting a department"
            valueClassName="text-status-reported"
          />
          <StatCard
            label="In process"
            value={summary.inProcess}
            hint="Being worked on"
            valueClassName="text-status-process"
          />
          <StatCard
            label="Resolved"
            value={summary.resolved}
            hint="Confirmed fixed"
            emphasis
          />
        </div>

        {/* -- Recent reports --------------------------------------------- */}
        <section className="mt-7">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[1.0625rem] font-semibold tracking-tight text-ink">
              Your recent reports
            </h2>
            {reports.length > recent.length ? (
              <Link
                href="/dashboard/reports"
                className="text-[0.875rem] font-medium text-civic-700 hover:underline"
              >
                See all {reports.length}
              </Link>
            ) : null}
          </div>

          {recent.length === 0 ? (
            <EmptyState
              icon={Camera}
              title="Nothing reported yet"
              body="When you report a problem, you can follow exactly what the department does about it from here."
              action={
                <Link
                  href="/report"
                  className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-field)] bg-civic-600 px-5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-civic-700"
                >
                  <Camera className="size-4" aria-hidden="true" />
                  Report a problem
                </Link>
              }
            />
          ) : (
            <ul className="grid gap-3">
              {recent.map((report) => {
                const issue = report.issue;

                /*
                 * A report has no issue until the intake pipeline has grouped
                 * it, so a very recent one has no code and nothing to open. It
                 * is still listed — the citizen sent it, and it must not
                 * appear to have vanished.
                 */
                const body = (
                  <Card className="p-4 transition-colors hover:border-civic-200 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      {issue ? (
                        <span className="font-mono text-[0.8125rem] font-bold text-civic-700">
                          {issue.issueCode}
                        </span>
                      ) : (
                        <Badge>Being processed</Badge>
                      )}
                      {issue && issue.reportCount > 1 ? (
                        <Badge tone="brand">{issue.reportCount} people reported this</Badge>
                      ) : null}
                      <span className="ms-auto text-[0.75rem] text-muted">
                        {formatDate(report.submittedAt)}
                      </span>
                    </div>

                    <p className="mt-1.5 text-[0.9375rem] font-semibold leading-snug text-ink">
                      {issue?.title ?? report.title ?? "Your report"}
                    </p>
                    {report.locationLabel ? (
                      <p className="mt-0.5 text-[0.8125rem] text-muted">{report.locationLabel}</p>
                    ) : null}

                    <div className="mt-4 max-w-sm">
                      <StatusProgress
                        stageName={issue?.stageName ?? null}
                        isResolved={issue?.isResolved ?? false}
                        size="compact"
                      />
                    </div>
                  </Card>
                );

                return (
                  <li key={report.reportId}>
                    {issue ? (
                      <Link href={`/dashboard/reports/${issue.issueCode}`} className="block">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* -- Report something new --------------------------------------- */}
        <section className="mt-7">
          <h2 className="mb-3 text-[1.0625rem] font-semibold tracking-tight text-ink">
            Report something new
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/report"
              className="group flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-colors hover:border-civic-500 hover:bg-civic-50/50"
            >
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-civic-600 text-white">
                <Camera className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-ink">
                  {t.dashboard.reportCamera}
                </span>
                <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-muted">
                  {t.dashboard.reportCameraBody}
                </span>
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>

            <Link
              href="/report"
              className="group flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-colors hover:border-civic-500 hover:bg-civic-50/50"
            >
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-civic-50 text-civic-700">
                <Mic className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-ink">
                  {t.dashboard.reportVoice}
                </span>
                <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-muted">
                  {t.dashboard.reportVoiceBody}
                </span>
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>

          <Card className="mt-3 shadow-none">
            <CardBody className="p-4 sm:p-5">
              <CardEyebrow>{t.dashboard.commonIssues}</CardEyebrow>
              <ul className="mt-3.5 grid grid-cols-4 gap-2">
                {COMMON_ISSUES.map((issue) => {
                  const Icon = issue.icon;
                  return (
                    <li key={issue.label} className="text-center">
                      <span className="mx-auto flex size-11 items-center justify-center rounded-[14px] bg-canvas">
                        <Icon className="size-5 text-civic-600" aria-hidden="true" />
                      </span>
                      <span className="mt-2 block text-[0.6875rem] font-medium leading-tight text-muted">
                        {issue.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </section>

        {/* -- Elsewhere --------------------------------------------------- */}
        <section className="mt-7 grid gap-3 sm:grid-cols-2">
          {landing.role === "both" ? (
            <Link
              href="/gov"
              className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-colors hover:border-civic-200"
            >
              <Building2 className="size-5 shrink-0 text-civic-700" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-ink">
                  Authority workspace
                </span>
                <span className="text-[0.8125rem] text-muted">
                  You also have a department account.
                </span>
              </span>
            </Link>
          ) : null}

          <Link
            href="/performance"
            className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-colors hover:border-civic-200"
          >
            <BarChart3 className="size-5 shrink-0 text-civic-700" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold text-ink">
                Authority performance
              </span>
              <span className="text-[0.8125rem] text-muted">
                How authorities are resolving civic issues.
              </span>
            </span>
          </Link>
        </section>
      </div>
    </CitizenShell>
  );
}
