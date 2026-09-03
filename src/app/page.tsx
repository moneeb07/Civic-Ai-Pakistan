import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Camera,
  Layers,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { SiteHeader } from "@/components/landing/site-header";
import { CivicSkyline, CrescentField } from "@/components/landing/pakistan-scene";
import { RevealGroup, RevealItem } from "@/components/landing/reveal";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/*
 * The front door, for two very different audiences.
 *
 * CivicAI has a citizen half and an authority half, and someone arriving cold
 * has to be able to tell which is theirs in about a second. The split here is
 * about INTENT, not a second login system: both paths authenticate identically,
 * and where someone lands is decided by what their account actually is, never
 * by which button they pressed.
 *
 * The two halves are deliberately given different visual temperature. The
 * citizen side is light, open and photographic; the authority side is a deep
 * green instrument panel. A citizen should never wonder whether the government
 * portal is meant for them, and an officer should recognise their own door
 * immediately.
 */

/** The accountability chain, shown before sign-in because it IS the pitch. */
const CHAIN = [
  { icon: Building2, label: "Authority", detail: "CDA, WASA, LWMC" },
  { icon: Users, label: "Departments", detail: "Roads, Water, Municipal" },
  { icon: ListChecks, label: "Civic issues", detail: "Grouped from reports" },
  { icon: CheckCircle2, label: "Resolution", detail: "On the public record" },
];

const HOW_IT_WORKS = [
  {
    icon: Camera,
    title: "Report it in a minute",
    body: "Photograph the problem, or describe it out loud in Urdu or English. Location is captured for you.",
  },
  {
    icon: Sparkles,
    title: "AI routes it to the right desk",
    body: "The problem is identified and sent to the department that actually owns it — not a general inbox.",
  },
  {
    icon: Layers,
    title: "Duplicate reports become one issue",
    body: "When a hundred people report one pothole, the department sees one job, and every reporter keeps their own tracking code.",
  },
  {
    icon: BarChart3,
    title: "The outcome is public",
    body: "Every authority's resolution rate is published, measured against the workload it actually carries.",
  },
];

export default async function LandingPage() {
  // Anyone already signed in has no business on the marketing page.
  if (await getSession()) redirect("/dashboard");

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <SiteHeader />

      {/* -- Hero: citizen on the left, authority on the right ------------- */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-7xl lg:grid-cols-[1.05fr_0.95fr]">
          {/* Citizen half */}
          <div className="relative flex flex-col overflow-hidden bg-surface px-5 pb-0 pt-10 sm:px-8 sm:pt-14 lg:pt-20">
            <CrescentField className="pointer-events-none absolute -right-16 -top-16 size-72 text-civic-500/[0.07]" />

            <RevealGroup immediate className="relative max-w-xl">
              <RevealItem as="span" className="inline-flex items-center gap-2 rounded-full border border-civic-200 bg-civic-50 px-3 py-1 text-[0.75rem] font-semibold text-civic-700">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                For every citizen of Pakistan
              </RevealItem>

              <RevealItem><h1 className="mt-5 text-[2.25rem] font-bold leading-[1.05] tracking-tight text-ink sm:text-[2.75rem] lg:text-[3.25rem]">
                Your voice.
                <br />
                Your city.
                <br />
                <span className="text-civic-600">Your CivicAI.</span>
              </h1></RevealItem>

              <RevealItem><p className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-muted">
                Report a broken street light, a pothole, a water leak. We send it to
                the department responsible and show you exactly what happens next.
              </p></RevealItem>

              <RevealItem className="mt-7 flex flex-wrap gap-2.5">
                <Button asChild size="default" className="px-6">
                  <Link href="/register">
                    Report a problem
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/register">Sign up</Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/auth/sign-in">Sign in</Link>
                </Button>
              </RevealItem>

              <dl className="mt-9 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-6">
                {[
                  { value: "Free", label: "Always, for citizens" },
                  { value: "اردو", label: "Report in your language" },
                  { value: "Public", label: "Every outcome published" },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-[1.125rem] font-bold tracking-tight text-ink">
                      {item.value}
                    </dt>
                    <dd className="text-[0.8125rem] text-muted">{item.label}</dd>
                  </div>
                ))}
              </dl>
            </RevealGroup>

            {/*
              The skyline anchors the hero to the ground rather than floating.
              mt-auto keeps it welded to the bottom edge whatever the column
              height turns out to be.
            */}
            <CivicSkyline className="relative -mx-5 mt-auto block h-24 w-[calc(100%+2.5rem)] text-civic-600 sm:-mx-8 sm:w-[calc(100%+4rem)]" />
          </div>

          {/* Authority half */}
          <div
            id="for-authorities"
            className="relative overflow-hidden bg-civic-900 px-5 py-10 text-white sm:px-8 sm:py-14 lg:py-20"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 -right-24 size-80 rounded-full bg-civic-500/25 blur-3xl"
            />

            <div className="relative max-w-md">
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-civic-200">
                Restricted access
              </span>

              <h2 className="mt-3 text-[1.75rem] font-bold leading-tight tracking-tight sm:text-[2rem]">
                Authority Operations Portal
              </h2>

              <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/70">
                Secure access for authorised civic departments and government teams.
                Accounts are issued by your authority&rsquo;s administrator — never
                self-registered.
              </p>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <Button
                  asChild
                  className="bg-civic-200 px-6 text-civic-900 hover:bg-white"
                >
                  <Link href="/gov/login">
                    Authority sign in
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  className="border-white/25 bg-transparent text-white hover:border-white/50 hover:bg-white/10"
                >
                  <Link href="/gov/login">Redeem an invitation</Link>
                </Button>
              </div>

              <p className="mt-10 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-white/40">
                Chain of accountability
              </p>

              <ol className="mt-3 space-y-2">
                {CHAIN.map((step, index) => {
                  const Icon = step.icon;
                  const isLast = index === CHAIN.length - 1;

                  return (
                    <li
                      key={step.label}
                      className={`flex items-center gap-3 rounded-[var(--radius-field)] border px-3.5 py-2.5 ${
                        isLast
                          ? "border-civic-500/60 bg-civic-500/15"
                          : "border-white/12 bg-white/[0.06]"
                      }`}
                    >
                      <Icon className="size-4 shrink-0 text-civic-200" aria-hidden="true" />
                      <span className="text-[0.875rem] font-semibold">{step.label}</span>
                      <span className="ms-auto text-[0.75rem] text-white/50">{step.detail}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* -- How it works -------------------------------------------------- */}
      <section id="how-it-works" className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="max-w-2xl">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-civic-700">
            How it works
          </span>
          <h2 className="mt-3 text-[1.75rem] font-bold tracking-tight text-ink sm:text-[2rem]">
            From a photograph to a fixed street
          </h2>
        </div>

        {/*
          Numbered because these genuinely are a sequence — each step depends on
          the one before it. Numbering a set of unordered features would be
          decoration; here it carries information.
        */}
        {/* RevealGroup renders a div, so the list role is restated for assistive tech. */}
        <RevealGroup role="list" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step, index) => {
            const Icon = step.icon;
            return (
              <RevealItem
                as="li"
                key={step.title}
                className="rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-colors hover:border-civic-200"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-[12px] bg-civic-50 text-civic-700">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-[0.75rem] font-bold text-muted">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-3.5 text-[0.9375rem] font-semibold tracking-tight text-ink">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">{step.body}</p>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </section>

      {/* -- Public accountability ---------------------------------------- */}
      <section className="mx-auto w-full max-w-7xl px-5 pb-16 sm:px-8">
        <Link
          href="/performance"
          className="group flex flex-wrap items-center gap-5 rounded-[var(--radius-panel)] border border-civic-200 bg-civic-50 px-6 py-7 transition-colors hover:border-civic-500 hover:bg-civic-100"
        >
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-civic-600 text-white">
            <BarChart3 className="size-5" aria-hidden="true" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[1.125rem] font-bold tracking-tight text-ink">
              Authority performance &amp; accountability
            </span>
            <span className="mt-1 block max-w-2xl text-[0.9375rem] leading-relaxed text-civic-900/70">
              How every authority is doing on the problems citizens reported to it —
              ranked by resolution rate against workload, not raw numbers. Public, and
              readable without an account.
            </span>
          </span>

          <ArrowRight
            className="size-5 shrink-0 text-civic-700 transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      </section>

      {/* -- Footer -------------------------------------------------------- */}
      <footer className="mt-auto border-t border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-4 px-5 py-8 sm:px-8">
          <CivicAILogo />
          <p className="max-w-md text-[0.8125rem] leading-relaxed text-muted">
            CivicAI reads the details on your CNIC to save you typing them. It does not
            verify your card against NADRA, and no screen here claims otherwise.
          </p>
          <Link
            href="/performance"
            className="ms-auto text-[0.875rem] font-medium text-civic-700 hover:underline"
          >
            Authority performance
          </Link>
        </div>
      </footer>
    </div>
  );
}
