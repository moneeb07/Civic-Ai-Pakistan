"use client";

/*
 * A client component purely so it can read the citizen's language.
 * It fetches nothing and holds no state — but it IS imported by client
 * components, so it cannot be an async server component, and the
 * dictionary has to come from the context rather than from cookies().
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { StepProgress } from "@/components/registration/step-progress";
import { useT } from "@/components/i18n/locale-provider";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import type { RegistrationStep } from "@/lib/registration/schema";


/*
 * The frame every registration step sits in.
 *
 * Mobile-first: a single column with the progress bar pinned under the header,
 * so the citizen can always see where they are. On desktop the same column is
 * centred rather than stretched — a form does not get easier to read at 1400px.
 *
 * `wide` is the one exception, and it is earned rather than decorative. The
 * identity step is not a form: it is a camera, a checklist and a picture of
 * the card being asked for, and those three want to be visible AT ONCE. Squeeze
 * them into a 36rem column and the citizen scrolls between the instructions and
 * the viewfinder while holding a card up to the lens.
 */
export function RegistrationShell({
  step,
  backHref,
  wide = false,
  children,
}: {
  step: RegistrationStep;
  backHref?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const column = wide ? "max-w-6xl" : "max-w-xl";
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className={`mx-auto w-full ${column} px-5 py-3.5`}>
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

            {/*
              The logo is a link home, which is what people expect a masthead
              to be — and here it is also the only exit. The back arrow walks
              one step at a time and is absent on the first screen, so a
              citizen who opened registration by mistake had nothing to press.
            */}
            <Link
              href="/"
              aria-label={`${t.brand.name} — home`}
              className="flex-1 rounded-[10px] transition-opacity hover:opacity-80"
            >
              <CivicAILogo showCountry={false} className="justify-center" />
            </Link>

            {/* Replaces a dead spacer. The language switch has to be reachable
                mid-flow: a citizen finds out they need it at the first screen
                of instructions, not before. */}
            <LanguageToggle />
          </div>

          <div className="mt-3">
            <StepProgress current={step} />
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full ${column} flex-1 px-5 py-6 pb-16`}>
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
