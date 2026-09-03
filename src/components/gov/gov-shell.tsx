import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { GovNav } from "@/components/gov/gov-nav";
import { NotificationBell } from "@/components/gov/notification-bell";
import { Avatar } from "@/components/ui/avatar";
import { getDictionary } from "@/lib/i18n";
import type { OfficerDto } from "@/lib/gov/schema";

const t = getDictionary();

/*
 * The frame every government screen sits in.
 *
 * Deliberately a different SURFACE from the citizen app: a persistent deep
 * green sidebar, a denser top bar, a wider content column. Same design system
 * and the same tokens, but an officer lives in this all day working a queue,
 * where a citizen opens their side a few times a year to check on a pothole.
 * Giving both the same airy layout would serve neither.
 *
 * The props are unchanged from the header-only version this replaces —
 * `officer`, an optional `backHref`, and children — so every existing gov page
 * keeps working without edits.
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
  const scope = officer.deptName ?? officer.orgName ?? "Government portal";

  return (
    <div className="flex min-h-full flex-col bg-canvas lg:flex-row">
      {/* Operations sidebar — desktop only. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-civic-900 px-3 py-5 lg:flex">
        <Link href="/gov" className="px-2 pb-6" aria-label="CivicAI — government portal">
          <CivicAILogo tone="light" showCountry={false} />
          <span className="mt-1.5 block text-[0.625rem] font-bold uppercase tracking-[0.16em] text-white/45">
            {t.gov.portalName}
          </span>
        </Link>

        <GovNav role={officer.role} />

        {/* The officer's own scope, pinned to the foot so "who am I acting as"
            is always answerable without opening a menu. */}
        <div className="mt-auto flex items-center gap-2.5 rounded-[12px] bg-white/[0.06] px-3 py-2.5">
          <Avatar name={officer.name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.75rem] font-semibold text-white">
              {officer.name}
            </span>
            <span className="block truncate text-[0.6875rem] text-white/50">
              {t.gov.roles[officer.role]}
            </span>
          </span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
          <div className="flex w-full items-center gap-3 px-5 py-3 sm:px-7">
            {backHref ? (
              <Link
                href={backHref}
                aria-label={t.gov.common.back}
                className="-ms-2 inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <ArrowLeft className="size-5" aria-hidden="true" />
              </Link>
            ) : null}

            {/* Brand only on small screens, where the sidebar is gone. */}
            <Link href="/gov" className="lg:hidden" aria-label="CivicAI — government portal">
              <CivicAILogo showCountry={false} markClassName="size-8" />
            </Link>

            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-[1.0625rem] font-bold tracking-tight text-ink">
                {officer.orgName ?? "CivicAI"}
              </p>
              <p className="truncate text-[0.8125rem] text-muted">{scope}</p>
            </div>

            <div className="ms-auto flex min-w-0 items-center gap-1 sm:gap-2">
              <NotificationBell />

              <span className="hidden min-w-0 text-end lg:hidden sm:block">
                <span className="block truncate text-[0.8125rem] font-semibold text-ink">
                  {officer.name}
                </span>
                <span className="block truncate text-[0.6875rem] text-muted">
                  {t.gov.roles[officer.role]}
                </span>
              </span>

              <span className="lg:hidden">
                <Avatar name={officer.name} size="md" />
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 py-6 pb-16 sm:px-7">{children}</main>
      </div>
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
