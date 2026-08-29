import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { getDictionary } from "@/lib/i18n";
import type { OfficerDto } from "@/lib/gov/schema";

const t = getDictionary();

/*
 * The frame every government screen sits in.
 *
 * Composed from the same pieces as ReportShell (sticky bordered header, logo,
 * a centred column that doesn't stretch on desktop) so the portal reads as
 * the same product as the citizen app rather than a separate system — but
 * wider, because officers work on desktops with tables and queues, where the
 * citizen flow is deliberately one-thing-per-screen on a phone.
 */
export function GovShell({
  officer,
  backHref,
  children,
}: {
  officer: OfficerDto;
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-5 py-3.5">
          {backHref ? (
            <Link
              href={backHref}
              aria-label={t.gov.common.back}
              className="-ms-2 inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </Link>
          ) : null}

          <CivicAILogo showCountry={false} />

          <span className="hidden rounded-full bg-civic-50 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-civic-700 sm:inline-block">
            {t.gov.portalName}
          </span>

          <div className="ms-auto flex min-w-0 items-center gap-3">
            <span className="hidden min-w-0 text-end sm:block">
              <span className="block truncate text-[0.8125rem] font-semibold text-ink">
                {officer.name}
              </span>
              <span className="block truncate text-[0.6875rem] text-muted">
                {t.gov.roles[officer.role]}
                {officer.deptName ? ` · ${officer.deptName}` : officer.orgName ? ` · ${officer.orgName}` : ""}
              </span>
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6 pb-16">{children}</main>
    </div>
  );
}

/** Standard title block for a government screen — one purpose per page, same as ReportStepHeading. */
export function GovPageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
