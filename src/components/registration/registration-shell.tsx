import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { StepProgress } from "@/components/registration/step-progress";
import { getDictionary } from "@/lib/i18n";
import type { RegistrationStep } from "@/lib/registration/schema";

const t = getDictionary();

/*
 * The frame every registration step sits in.
 *
 * Mobile-first: a single column with the progress bar pinned under the header,
 * so the citizen can always see where they are. On desktop the same column is
 * centred rather than stretched — a form does not get easier to read at 1400px.
 */
export function RegistrationShell({
  step,
  backHref,
  children,
}: {
  step: RegistrationStep;
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto w-full max-w-xl px-5 py-3.5">
          <div className="flex items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                aria-label={t.registration.back}
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

          <div className="mt-3">
            <StepProgress current={step} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-6 pb-16">
        {children}
      </main>
    </div>
  );
}

/** Standard title block for a step. One purpose per screen. */
export function StepHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
