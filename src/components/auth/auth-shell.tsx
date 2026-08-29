import type { ReactNode } from "react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { CivicAIVisual } from "@/components/brand/civicai-visual";
import { getDictionary } from "@/lib/i18n";

/*
 * Desktop: a deep-green brand panel beside the authentication card.
 * Mobile: the panel collapses to a compact header so the form is reachable
 * without scrolling — the layout is recomposed, not scaled down.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const t = getDictionary();

  return (
    <div className="flex min-h-full flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:grid-cols-2">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden overflow-hidden bg-civic-900 lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="absolute inset-0" aria-hidden="true">
          <CivicAIVisual />
        </div>

        <div className="relative">
          <CivicAILogo tone="light" />
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
        <header className="flex items-center justify-center border-b border-line bg-surface px-5 py-4 lg:hidden">
          <CivicAILogo showCountry={false} />
        </header>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8 sm:py-12">
          {children}
        </div>
      </main>
    </div>
  );
}
