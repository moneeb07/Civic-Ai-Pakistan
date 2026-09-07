"use client";

/*
 * A client component purely so it can read the citizen's language.
 * It fetches nothing and holds no state — but it IS imported by client
 * components, so it cannot be an async server component, and the
 * dictionary has to come from the context rather than from cookies().
 */
import type { ReactNode } from "react";
import Link from "next/link";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { CivicAIVisual } from "@/components/brand/civicai-visual";
import { useT } from "@/components/i18n/locale-provider";
import { FlowDirection } from "@/components/i18n/flow-direction";
import { LanguageToggle } from "@/components/i18n/language-toggle";

/*
 * Desktop: a deep-green brand panel beside the authentication card.
 * Mobile: the panel collapses to a compact header so the form is reachable
 * without scrolling — the layout is recomposed, not scaled down.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const t = useT();

  return (
    <FlowDirection>
    <div className="flex min-h-full flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:grid-cols-2">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden overflow-hidden bg-civic-900 lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="absolute inset-0" aria-hidden="true">
          <CivicAIVisual />
        </div>

        {/* A way back to the landing page. Sign-in is a dead end otherwise —
            the only other links on this screen go deeper into the flow. */}
        <div className="relative">
          <Link href="/" aria-label="CivicAI — home" className="inline-block rounded-[10px] transition-opacity hover:opacity-80">
            <CivicAILogo tone="light" />
          </Link>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[2.5rem] font-semibold leading-[1.12] tracking-tight text-white">
            {t.brand.headline}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-white/70">
            {t.brand.supporting}
          </p>
        </div>

        <p className="relative text-sm text-white/45">
          {t.brand.name} · {t.brand.country}
        </p>
      </aside>

      {/* Authentication column */}
      <main className="flex flex-1 flex-col">
        {/* Compact brand header — mobile and tablet only */}
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4 lg:hidden">
          <Link href="/" aria-label="CivicAI — home" className="rounded-[10px] transition-opacity hover:opacity-80">
            <CivicAILogo showCountry={false} />
          </Link>
          <LanguageToggle />
        </header>

        {/* Desktop: the toggle sits above the card, where the brand panel
            already carries the identity and this column carries the task. */}
        <div className="hidden justify-end px-8 pt-6 lg:flex">
          <LanguageToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8 sm:py-12">
          {children}
        </div>
      </main>
    </div>
    </FlowDirection>
  );
}
