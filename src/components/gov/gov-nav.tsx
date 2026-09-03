"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Sparkles,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { OfficerRole } from "@/lib/gov/schema";

/*
 * The operations sidebar.
 *
 * A client island purely because the active item depends on the path — the
 * shell around it stays a server component.
 *
 * Icons are declared HERE rather than passed in from the server shell: an icon
 * is a function, functions cannot be serialised across the server/client
 * boundary, and passing them down fails at runtime with "Functions cannot be
 * passed directly to Client Components".
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Roles that may see this section. Everyone, when omitted. */
  roles?: OfficerRole[];
}

const ITEMS: NavItem[] = [
  { href: "/gov", label: "Overview", icon: LayoutDashboard },
  { href: "/gov/work", label: "Issues", icon: ListChecks },
  { href: "/gov/intelligence", label: "AI grouping", icon: Sparkles },
  {
    href: "/gov/org",
    label: "Departments",
    icon: Building2,
    roles: ["platform_admin", "org_head"],
  },
  {
    href: "/gov/dept",
    label: "Members",
    icon: Users,
    roles: ["platform_admin", "org_head", "dept_head"],
  },
  { href: "/gov/notifications", label: "Discussions", icon: MessagesSquare },
  { href: "/gov/analytics", label: "Analytics", icon: BarChart3 },
];

export function GovNav({
  role,
  unread = 0,
}: {
  role: OfficerRole;
  unread?: number;
}) {
  const pathname = usePathname();

  /*
   * Sections the officer cannot open are hidden rather than shown disabled.
   * A greyed-out "Departments" tells a member the feature exists and that they
   * are not trusted with it, which is noise on a screen they use all day —
   * and the server authorises every one of these routes regardless.
   */
  const visible = ITEMS.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <nav aria-label="Sections" className="flex flex-col gap-0.5">
      {visible.map((item) => {
        const active =
          item.href === "/gov" ? pathname === "/gov" : pathname.startsWith(item.href);
        const Icon = item.icon;
        const badge = item.href === "/gov/notifications" ? unread : 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[0.8125rem] font-medium transition-colors",
              active
                ? "bg-white/12 text-white"
                : "text-white/65 hover:bg-white/[0.07] hover:text-white",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {badge > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-status-reported px-1.5 text-[0.625rem] font-bold text-white">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
