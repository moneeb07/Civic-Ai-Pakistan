"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home, Map, PlusCircle, UserRound } from "lucide-react";

import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const t = getDictionary();

/*
 * Bottom tab bar, from the reference.
 *
 * Home, Report, My Reports and Profile all lead somewhere real. Map remains
 * marked unavailable rather than dead-ending on a broken screen — hiding it
 * would misrepresent what CivicAI is for, and faking it would be worse.
 */
const TABS = [
  { href: "/dashboard", label: t.dashboard.navHome, icon: Home, ready: true },
  { href: "/report", label: t.dashboard.navReport, icon: PlusCircle, ready: true },
  { href: "/dashboard/reports", label: t.dashboard.navMyReports, icon: FileText, ready: true },
  { href: "/dashboard/map", label: t.dashboard.navMap, icon: Map, ready: false },
  { href: "/dashboard/profile", label: t.dashboard.navProfile, icon: UserRound, ready: true },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;

          const inner = (
            <>
              <Icon
                className={cn("size-[22px]", active ? "text-civic-600" : "text-muted")}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "text-[0.6875rem] font-medium",
                  active ? "text-civic-700" : "text-muted",
                )}
              >
                {tab.label}
              </span>
            </>
          );

          // 56px minimum height keeps every tab a comfortable thumb target.
          const shared =
            "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2";

          return (
            <li key={tab.href} className="flex flex-1">
              {tab.ready ? (
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(shared, "transition-colors hover:bg-canvas")}
                >
                  {inner}
                </Link>
              ) : (
                <span
                  className={cn(shared, "cursor-not-allowed opacity-45")}
                  aria-disabled="true"
                  title={t.dashboard.comingSoonBadge}
                >
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
