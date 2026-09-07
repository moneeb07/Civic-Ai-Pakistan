import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Camera,
  Globe,
  Layers,
  Leaf,
  LogIn,
  MapPin,
  Megaphone,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { HeroHeader } from "@/components/landing/hero-header";
import { RevealGroup, RevealItem } from "@/components/landing/reveal";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/*
 * The front door.
 *
 * A single full-bleed photograph of Pakistan's landmarks stands behind the
 * whole hero, with the header floating transparently on top of it — the
 * layout the reference design calls for, in place of the earlier two-column
 * split between a citizen half and a large "Authority Operations Portal"
 * panel.
 *
 * Authority access did not disappear; it moved. The reference shows it as a
 * single compact button in the header ("Authority Sign In"), so that is what
 * it is here too — see HeroHeader. Registering a NEW authority still has a
 * real path (`/gov/onboarding`, built earlier), it is just no longer
 * advertised from the hero at panel size; it is linked from the sign-in
 * page itself instead, which is where somebody who does not yet have an
 * account actually ends up looking for it.
 */

/*
 * The bottom bar's four claims, reusing exactly the ones this project
 * already verified as true rather than the reference mockup's specific
 * "100M+ Citizens" / "500+ Cities & Districts" figures.
 *
 * Those are the kind of concrete usage numbers a real government-adjacent
 * platform cannot assert without a source, and CivicAI does not have
 * anywhere near that user base yet. Reusing invented figures here would have
 * been the app telling every citizen who opens it something false about how
 * many people already trust it. The bar's VISUAL pattern — icon, bold value,
 * a short label — is kept exactly; only the two fabricated headline numbers
 * are replaced with claims this product can actually stand behind.
 */
/** The four feature chips under the hero buttons. Icon and label, nothing else. */
const FEATURES = [
  { icon: Leaf, label: "Cleaner Communities" },
  { icon: ShieldCheck, label: "Safer Cities" },
  { icon: Users, label: "Stronger Together" },
  { icon: BarChart3, label: "Real Impact" },
];

const TRUST_BAR = [
  { icon: MapPin, value: "Built for Pakistan", label: "Every city, every citizen" },
  { icon: Sparkles, value: "Free", label: "Always, for citizens" },
  { icon: Globe, value: "\u0627\u0631\u062f\u0648", label: "Report in your language" },
  { icon: ShieldCheck, value: "Public", label: "Every outcome published" },
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
      {/*
        -- Hero: one full-bleed photograph, the header floating on it --------

        The photograph (Faisal Mosque, Minar-e-Pakistan, Lahore Fort,
        Mazar-e-Quaid, the northern mountains and the flag) is a supplied
        background ASSET, not something rebuilt in CSS — it is placed once,
        with `object-fit: cover`, and never redrawn.

        The section has no fixed height of its own. `min-h-*` is set on the
        CONTENT column below, and the background `fill` image simply covers
        whatever height that content ends up requiring at each breakpoint —
        which is what keeps this responsive without a hand-tuned height per
        device: shrink the viewport, the content column shrinks with it, and
        the photograph crops to match rather than stretching or leaving a
        gap.
      */}
      <section className="relative overflow-hidden border-b border-line">
        {/*
          Two different photographs, not one photograph cropped two ways.
          The landscape shot has a wide band of monuments across a short
          strip; a phone screen is the opposite shape, so cropping it for
          mobile meant showing mostly empty sky above a sliver of skyline. A
          photograph actually composed in portrait — flag top-right, sky
          falling away to mountains, the monuments and their reflection
          filling the lower half — fills that shape properly instead of
          being squeezed into it. `sm:hidden` / `hidden sm:block` swap them
          at the same breakpoint the rest of this hero already uses.
        */}
        <Image
          src="/pakistan-hero-bg-mobile.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_82%] sm:hidden"
        />
        <Image
          src="/pakistan-hero-bg.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="hidden object-cover object-[center_92%] sm:block"
        />

        {/*
          A very light, one-directional wash — not a panel. It exists purely
          so the darkest heading text still clears contrast over the palest
          part of the sky; at 0.35 opacity the mountains and skyline behind it
          stay fully visible, which a solid card never would.
        */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-white/60 via-white/20 to-transparent sm:from-white/50"
        />

        <div className="relative z-10">
          <HeroHeader />

          <div className="relative mx-auto w-full max-w-7xl min-h-[26rem] px-5 pb-10 pt-2 sm:min-h-[30rem] sm:px-8 sm:pb-12 lg:min-h-[36rem]">
            <RevealGroup immediate className="max-w-xl">
              <RevealItem className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.75rem] font-bold uppercase tracking-[0.14em]">
                <span className="inline-flex items-center gap-1.5 text-civic-700">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  For Citizens
                </span>
                <span className="text-ink/25">|</span>
                <span className="text-ink/55">Cleaner Cities</span>
                <span className="text-ink/25">|</span>
                <span className="text-ink/55">Stronger Pakistan</span>
              </RevealItem>

              <RevealItem>
                <h1 className="mt-4 text-[2.25rem] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[2.75rem] lg:text-[3.25rem]">
                  Your Voice.
                  <br />
                  Your City.
                  <br />
                  Your <span className="text-civic-600">CivicAI.</span>
                </h1>
              </RevealItem>

              <RevealItem>
                <p className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-ink/70">
                  Report issues, track progress, and be part of the change.
                  Together, let&rsquo;s build cleaner, safer and better
                  communities across Pakistan.
                </p>
              </RevealItem>

              <RevealItem className="mt-7 flex flex-wrap gap-2.5">
                <Button asChild className="px-6 shadow-lg">
                  <Link href="/register">
                    <Megaphone className="size-4" aria-hidden="true" />
                    Report a Problem
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="border-civic-600 bg-surface/90 px-6 shadow-sm backdrop-blur"
                >
                  <Link href="/auth/sign-up">
                    <UserPlus className="size-4" aria-hidden="true" />
                    Sign Up
                  </Link>
                </Button>
                <Button asChild variant="ink" className="px-6 shadow-lg">
                  <Link href="/auth/sign-in">
                    <LogIn className="size-4" aria-hidden="true" />
                    Sign In
                  </Link>
                </Button>
              </RevealItem>

              <RevealItem className="mt-8 flex flex-wrap gap-x-4 gap-y-4 sm:gap-x-7">
                {FEATURES.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.label}
                      className="flex w-16 flex-col items-center text-center sm:w-20"
                    >
                      <span className="grid size-11 place-items-center rounded-2xl bg-civic-50/90 text-civic-700 shadow-sm backdrop-blur">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="mt-2 text-[0.75rem] font-semibold leading-snug text-ink">
                        {feature.label}
                      </span>
                    </div>
                  );
                })}
              </RevealItem>
            </RevealGroup>

          </div>

          {/*
            The trust bar, full-bleed — a plain sibling of the content
            column rather than something inside it, so it can span edge to
            edge the way the reference shows it instead of stopping at the
            same max-w-7xl margins as the text above. It needs no `mt-auto`
            or absolute positioning: it simply comes last in flow, which is
            what keeps it at the true bottom of the section at any height.
          */}
          <div className="relative w-full bg-civic-900/85 px-5 py-4 text-white shadow-xl backdrop-blur-sm sm:px-8">
            <dl className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-8 gap-y-4">
              {TRUST_BAR.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-2.5">
                    <Icon className="size-4 shrink-0 text-civic-200" aria-hidden="true" />
                    <div className="leading-tight">
                      <dt className="text-[0.9375rem] font-bold">{item.value}</dt>
                      <dd className="text-[0.6875rem] text-white/65">{item.label}</dd>
                    </div>
                  </div>
                );
              })}
              <div className="ms-auto hidden max-w-[15rem] text-right text-[0.8125rem] italic leading-snug text-white/80 sm:block">
                &ldquo;Together for a Brighter Pakistan&rdquo;
              </div>
            </dl>
          </div>
        </div>
      </section>

{/* -- How it works -------------------------------------------------- */}
      <section id="about" className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
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
