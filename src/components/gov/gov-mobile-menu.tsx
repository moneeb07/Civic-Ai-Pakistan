"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/gov/gov-nav";
import type { OfficerDto } from "@/lib/gov/schema";

/*
 * What a narrow viewport was actually missing.
 *
 * `GovShell`'s operations sidebar — all seven sections, and the only sign-out
 * control anywhere in this portal — is `hidden lg:flex`: gone below desktop
 * width, with nothing in its place. Below `lg` an officer's header held a
 * bell, a name, and a bare avatar with no `onClick` at all — decoration, not
 * a control. So on a phone or a narrow window there was no way to reach
 * Departments, Analytics, or any other section, and no way to sign out short
 * of clearing cookies by hand.
 *
 * This is that missing control: a hamburger that discloses the SAME sections
 * NAV_ITEMS already defines for the desktop sidebar (one source of truth,
 * filtered by the same role rule), plus the sign-out this whole portal was
 * missing. It replaces the non-interactive avatar rather than sitting beside
 * it — that avatar did nothing, so nothing worth keeping is lost.
 */
export function GovMobileMenu({ officer }: { officer: OfficerDto }) {
  const [open, setOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const visible = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(officer.role));

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // An officer's own door, not the citizen one — they came in through
      // /gov/login and should land back on it to sign in again.
      router.push("/gov/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="gov-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink"
      >
        {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
      </button>

      {open ? (
        <div
          id="gov-mobile-menu"
          className="absolute inset-x-0 top-full z-40 border-b border-line bg-surface shadow-lg"
        >
          <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
            <Avatar name={officer.name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem] font-semibold text-ink">{officer.name}</p>
              <p className="truncate text-[0.8125rem] text-muted">
                {officer.deptName ?? officer.orgName ?? "Government portal"}
              </p>
            </div>
          </div>

          <nav aria-label="Sections" className="grid gap-0.5 px-3 py-3">
            {visible.map((item) => {
              const active =
                item.href === "/gov" ? pathname === "/gov" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-[var(--radius-field)] px-3 text-[0.9375rem] font-medium transition-colors",
                    active ? "bg-civic-50 text-civic-900" : "text-ink hover:bg-canvas",
                  )}
                >
                  <Icon
                    className={cn("size-4.5 shrink-0", active ? "text-civic-600" : "text-muted")}
                    aria-hidden="true"
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-line p-3">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-field)] px-3 text-[0.9375rem] font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-55"
            >
              <LogOut className="size-4.5 shrink-0" aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
