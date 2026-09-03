import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";

const STEPS = [
  { key: "camera", label: "Photo" },
  { key: "describe", label: "Describe" },
  { key: "location", label: "Location" },
  { key: "review", label: "Review" },
] as const;

type ReportStep = (typeof STEPS)[number]["key"];

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
  const currentIndex = STEPS.findIndex((entry) => entry.key === step);

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

          {/*
            Named steps rather than four anonymous bars.
            
            The bar version told somebody they were "three quarters through"
            without saying through WHAT, so there was no way to know that the
            next screen was the last one, or that the photo was already safely
            captured. Numbering is legitimate here because these genuinely are
            a sequence — each screen depends on the one before it.
          */}
          <ol
            className="mt-3 flex items-center gap-1.5"
            aria-label={`Step ${currentIndex + 1} of ${STEPS.length}`}
          >
            {STEPS.map((entry, index) => {
              const done = index < currentIndex;
              const current = index === currentIndex;

              return (
                <li key={entry.key} className="flex flex-1 flex-col gap-1.5">
                  <span
                    aria-hidden="true"
                    className={
                      done || current
                        ? "h-1 rounded-full bg-civic-600"
                        : "h-1 rounded-full bg-line-strong"
                    }
                  />
                  <span
                    className={
                      current
                        ? "text-[0.6875rem] font-semibold text-civic-700"
                        : done
                          ? "text-[0.6875rem] font-medium text-ink"
                          : "text-[0.6875rem] font-medium text-muted"
                    }
                  >
                    <span className="font-mono">0{index + 1}</span>{" "}
                    <span className="hidden sm:inline">{entry.label}</span>
                    {current ? <span className="sr-only"> (current step)</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
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
