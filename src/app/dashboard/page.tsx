import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Building2,
  Camera,
  Droplets,
  FileText,
  Lightbulb,
  Mic,
  PencilLine,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { ActionRow } from "@/components/ui/action-row";
import { Card, CardBody, CardEyebrow } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";
import { getCitizenProfile } from "@/lib/profile";
import { requireSession } from "@/lib/session";
import { resolveLanding } from "@/lib/civic/landing";

const t = getDictionary();

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return t.dashboard.greetingMorning;
  if (hour < 17) return t.dashboard.greetingAfternoon;
  return t.dashboard.greetingEvening;
}

/*
 * Phase 1 dashboard shell.
 *
 * The reporting entry points are shown because they are what CivicAI is for,
 * but they are visibly marked "Coming soon" rather than wired to a fake flow.
 * Nothing here submits a complaint.
 */
export default async function DashboardPage() {
  const session = await requireSession();

  /*
   * An authority account has no business on the citizen dashboard. Deciding
   * here rather than in the sign-in form means it holds however they arrive —
   * a bookmark, the proxy's redirect, or the sign-in button — instead of only
   * on the one path that happened to be wired up.
   *
   * Someone who is BOTH a citizen and a department member stays here: this is
   * the account they registered, and they get a link across instead.
   */
  const landing = await resolveLanding(session.user.id);
  if (landing.redirectTo) redirect(landing.redirectTo);

  const profile = await getCitizenProfile(session.user.id);

  const firstName = (profile?.fullName ?? session.user.name).split(" ")[0];

  const commonIssues = [
    { icon: TriangleAlert, label: t.dashboard.potholes },
    { icon: Trash2, label: t.dashboard.garbage },
    { icon: Lightbulb, label: t.dashboard.streetLight },
    { icon: Droplets, label: t.dashboard.waterLeakage },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-5">
      <header className="flex items-center justify-between gap-3">
        <CivicAILogo showCountry={false} />
      </header>

      <div className="mt-7">
        <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight text-ink">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-1.5 text-[0.9375rem] text-muted">{t.dashboard.prompt}</p>
      </div>

      <section className="mt-6 space-y-3" aria-label={t.dashboard.navReport}>
        {/*
          Both lead into the same real pipeline (/report starts at the
          camera; voice is offered as a description method once the photo
          and category are confirmed) — see camera-flow.tsx / describe-flow.tsx.
          "Type Instead" stays a placeholder: the approved Stage 2 flow is
          camera-first end to end, with typing as an in-flow alternative to
          voice rather than a second, photo-less entry point.
        */}
        <ActionRow
          icon={Camera}
          tone="green"
          title={t.dashboard.reportCamera}
          description={t.dashboard.reportCameraBody}
          href="/report"
        />
        <ActionRow
          icon={Mic}
          tone="blue"
          title={t.dashboard.reportVoice}
          description={t.dashboard.reportVoiceBody}
          href="/report"
        />
        <ActionRow
          icon={PencilLine}
          tone="amber"
          title={t.dashboard.reportType}
          description={t.dashboard.reportTypeBody}
          disabledReason={t.dashboard.comingSoonBadge}
        />
      </section>

      <section className="mt-6">
        <Card>
          <CardBody>
            <CardEyebrow>{t.dashboard.commonIssues}</CardEyebrow>
            <ul className="mt-4 grid grid-cols-4 gap-2">
              {commonIssues.map((issue) => {
                const Icon = issue.icon;
                return (
                  <li key={issue.label} className="text-center">
                    <span className="mx-auto flex size-12 items-center justify-center rounded-[14px] bg-canvas">
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

      {/*
        The two things a citizen wants after reporting: what happened to mine,
        and is this authority any good. Both are real pages, not placeholders.
      */}
      {landing.role === "both" ? (
        <section className="mt-6">
          <ActionRow
            icon={Building2}
            tone="green"
            title="Authority workspace"
            description="You also have an authority account. Open your department."
            href="/authority"
          />
        </section>
      ) : null}

      <section className="mt-6 space-y-3">
        <ActionRow
          icon={FileText}
          tone="blue"
          title="My reports"
          description="Track progress on everything you have reported."
          href="/dashboard/reports"
        />
        <ActionRow
          icon={BarChart3}
          tone="green"
          title="Authority performance"
          description="See how authorities are resolving civic issues."
          href="/performance"
        />
      </section>

      <section className="mt-4">
        <Card className="border-civic-200 bg-civic-50 shadow-none">
          <CardBody>
            <h2 className="text-[1.0625rem] font-semibold tracking-tight text-ink">
              {t.dashboard.notReadyTitle}
            </h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink/70">
              {t.dashboard.notReadyBody}
            </p>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
