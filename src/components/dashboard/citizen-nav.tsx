"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  MessagesSquare,
  PlusCircle,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * The sidebar links.
 *
 * A client component only because the active item depends on the current path.
 * The shell around it stays a server component, so this is the smallest
 * possible island rather than pushing the whole layout to the client.
 */

/*
 * The links live HERE, in the client component, rather than being passed in.
 *
 * An icon is a React component — a function — and functions cannot cross the
 * server/client boundary: React has nothing to serialise them into. Defining
 * the list in the server shell and passing it down looked tidy and failed at
 * runtime with "Functions cannot be passed directly to Client Components" for
 * every single icon. Only serialisable data crosses now.
 */
const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/report", label: "Report a problem", icon: PlusCircle },
  { href: "/dashboard/reports", label: "My reports", icon: FileText },
  { href: "/dashboard/messages", label: "Messages", icon: MessagesSquare },
  { href: "/performance", label: "Authority performance", icon: BarChart3 },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

export function CitizenNav({ unreadMessages = 0 }: { unreadMessages?: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="flex flex-col gap-0.5">
      {ITEMS.map((item) => {
        /*
         * Exact match for the dashboard root, prefix match for the rest —
         * otherwise "/dashboard" lights up on every page beneath it and the
         * highlight stops meaning anything.
         */
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

        const Icon = item.icon;
        const badge = item.href === "/dashboard/messages" ? unreadMessages : 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-[var(--radius-field)] px-3 text-[0.875rem] font-medium transition-colors",
              active
                ? "bg-civic-50 text-civic-900"
                : "text-muted hover:bg-canvas hover:text-ink",
            )}
          >
            <Icon
              className={cn("size-4.5 shrink-0", active ? "text-civic-600" : "text-muted")}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {badge > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-status-reported px-1.5 text-[0.6875rem] font-bold text-white">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
