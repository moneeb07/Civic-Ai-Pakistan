import type { ReactNode } from "react";
import Link from "next/link";
import { MessagesSquare, PlusCircle } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { CitizenNav } from "@/components/dashboard/citizen-nav";
import { Avatar } from "@/components/ui/avatar";

/*
 * The frame around every citizen screen.
 *
 * Two navigations, and deliberately not one shrunk down. On a desktop the
 * sidebar here is persistent and labelled; on a phone it disappears entirely
 * and the layout's bottom tab bar takes over, because a thumb reaches the
 * bottom of a screen and does not reach a hamburger in the top corner. The
 * brief asked for layouts to be recomposed for small screens rather than
 * scaled, and this is the main place that happens.
 *
 * The sidebar is intentionally lighter than the government one. A citizen
 * opens this a few times a year to check on a pothole; an officer lives in
 * theirs all day. Same design system, different density.
 */

export function CitizenShell({
  name,
  subtitle,
  unreadMessages = 0,
  children,
}: {
  name: string;
  subtitle?: string;
  /** Drives the badge on the Messages item. */
  unreadMessages?: number;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-canvas lg:flex-row">
      {/* Sidebar — desktop only. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-line bg-surface px-4 py-5 lg:flex">
        <Link href="/dashboard" className="px-2 pb-6" aria-label="CivicAI — dashboard">
          <CivicAILogo />
        </Link>

        <CitizenNav unreadMessages={unreadMessages} />

        <div className="mt-auto rounded-[var(--radius-card)] border border-civic-200 bg-civic-50 p-4">
          <p className="text-[0.8125rem] font-semibold text-civic-900">Something broken nearby?</p>
          <p className="mt-1 text-[0.75rem] leading-relaxed text-civic-900/70">
            A photograph is enough. We work out the rest.
          </p>
          <Link
            href="/report"
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius-field)] bg-civic-600 px-3 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-civic-700"
          >
            <PlusCircle className="size-4" aria-hidden="true" />
            Report a problem
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar. On mobile it carries the brand, since the sidebar is gone. */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-5 py-3 backdrop-blur sm:px-7">
          <Link href="/dashboard" className="lg:hidden" aria-label="CivicAI — dashboard">
            <CivicAILogo showCountry={false} markClassName="size-8" />
          </Link>

          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-[1.0625rem] font-bold tracking-tight text-ink">{name}</p>
            {subtitle ? <p className="truncate text-[0.8125rem] text-muted">{subtitle}</p> : null}
          </div>

          <div className="ms-auto flex items-center gap-2">
            {/* Hidden on the narrowest screens, where the row is already the
                brand plus two icon buttons; the same control sits in Profile
                for those, so nobody loses access to it. */}
            <LanguageToggle className="hidden sm:inline-flex" />
            <Link
              href="/dashboard/messages"
              className="relative inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink"
              aria-label={
                unreadMessages > 0
                  ? `Messages, ${unreadMessages} unread`
                  : "Messages"
              }
            >
              <MessagesSquare className="size-5" aria-hidden="true" />
              {unreadMessages > 0 ? (
                <span className="absolute end-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-status-reported px-1 text-[0.625rem] font-bold leading-4 text-white">
                  {unreadMessages > 9 ? "9+" : unreadMessages}
                </span>
              ) : null}
            </Link>

            <Link href="/dashboard/profile" aria-label="Your profile">
              <Avatar name={name} size="md" />
            </Link>
          </div>
        </header>

        {/*
          The thumb-reachable bottom navigation is rendered once by the
          /dashboard layout, for every page beneath it — not here, or pages
          using this shell would stack two of them.
        */}
        <main className="flex-1 px-5 py-6 sm:px-7 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
