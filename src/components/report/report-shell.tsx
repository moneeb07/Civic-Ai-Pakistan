import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";

const STEPS = ["camera", "describe", "location", "review"] as const;
type ReportStep = (typeof STEPS)[number];

/*
 * The frame every report-creation screen sits in — the same composition as
 * RegistrationShell (logo-centred header, back arrow, a thin step bar, a
 * centred single column that doesn't stretch on desktop), so the two account
 * journeys read as one product rather than two different ones bolted together.
 */
export function ReportShell({
  step,
  backHref,
  children,
}: {
  step: ReportStep;
  backHref?: string;
  children: ReactNode;
}) {
  const currentIndex = STEPS.indexOf(step);

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto w-full max-w-xl px-5 py-3.5">
          <div className="flex items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                aria-label="Back"
                className="-ms-2 inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <ArrowLeft className="size-5" aria-hidden="true" />
              </Link>
            ) : (
              <span className="size-10" aria-hidden="true" />
            )}

            <CivicAILogo showCountry={false} className="flex-1 justify-center" />

            <span className="size-10" aria-hidden="true" />
          </div>

          <div className="mt-3 flex gap-1.5" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
            {STEPS.map((s, index) => (
              <span
                key={s}
                className={
                  index <= currentIndex
                    ? "h-1 flex-1 rounded-full bg-civic-600"
                    : "h-1 flex-1 rounded-full bg-line-strong"
                }
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-6 pb-16">{children}</main>
    </div>
  );
}

/** Standard title block for a step — one purpose per screen, same as StepHeading in registration. */
export function ReportStepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{subtitle}</p>
      ) : null}
    </div>
  );
}
