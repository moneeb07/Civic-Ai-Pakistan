import Link from "next/link";
import {
  BarChart3,
  Building2,
  LayoutDashboard,
  MessagesSquare,
  Search,
  Users,
} from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import type { AuthorityViewer } from "@/lib/authority/access";

/*
 * Chrome for every authority screen.
 *
 * The header states who the viewer is acting as, including their member code,
 * because on a collaboration screen "who am I to everyone else here" is
 * information people actually need — it is the name that appears on their
 * messages and status changes.
 */
export function AuthorityShell({
  viewer,
  children,
}: {
  viewer: AuthorityViewer;
  children: React.ReactNode;
}) {
  const primary = viewer.memberships[0];
  const departments = viewer.memberships.filter((m) => m.departmentId !== null);

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/authority" className="flex items-center gap-2">
            <CivicAILogo className="h-6 w-auto" />
            <span className="text-[0.8125rem] font-semibold text-muted">Authority</span>
          </Link>

          <span className="flex-1" />

          <div className="text-end">
            <p className="text-[0.8125rem] font-semibold leading-tight text-ink">
              {primary?.displayName}
            </p>
            <p className="font-mono text-[0.6875rem] leading-tight text-muted">
              {primary?.memberCode} ·{" "}
              {viewer.isAdmin ? "Authority admin" : "Department member"}
            </p>
          </div>
        </div>

        {/*
          One nav for both roles, differing only by what the viewer can reach.
          An admin gets the authority-wide sections; a member gets their own
          departments. Nothing here is shown-but-disabled — a control that
          cannot be used is worse than an absent one.
        */}
        <nav className="mx-auto flex max-w-5xl flex-wrap gap-1 px-3 pb-2">
          {viewer.isAdmin ? (
            <NavLink href="/authority/admin" icon={<LayoutDashboard className="size-3.5" />}>
              Overview
            </NavLink>
          ) : null}

          <NavLink href="/authority/issues" icon={<Search className="size-3.5" />}>
            Issues
          </NavLink>

          {departments.map((membership) => (
            <NavLink
              key={membership.departmentId}
              href={`/authority/departments/${membership.departmentId}`}
              icon={<Building2 className="size-3.5" />}
            >
              {membership.departmentName}
            </NavLink>
          ))}

          <NavLink href="/authority/members" icon={<Users className="size-3.5" />}>
            Members
          </NavLink>

          <NavLink
            href="/authority/discussions"
            icon={<MessagesSquare className="size-3.5" />}
          >
            Discussions
          </NavLink>

          <NavLink href="/authority/analytics" icon={<BarChart3 className="size-3.5" />}>
            Analytics
          </NavLink>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-muted transition-colors hover:bg-civic-50 hover:text-civic-700"
    >
      {icon}
      {children}
    </Link>
  );
}
