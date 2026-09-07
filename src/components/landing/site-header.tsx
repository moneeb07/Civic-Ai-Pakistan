"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { cn } from "@/lib/utils";

/*
 * The public header.
 *
 * Signed-out only — once someone is authenticated they are inside the citizen
 * or government shell, each of which carries its own navigation. Mixing the
 * two would leave a signed-in officer looking at marketing links.
 *
 * The row carries navigation and the language control and nothing else: the
 * hero directly beneath it already offers Report a problem, Sign up, Sign in
 * and both authority doors. Repeating them here would put five competing calls
 * to action in the first 200 pixels of the page.
 *
 * On small screens the nav becomes a disclosure rather than a shrunken row:
 * six links squeezed onto a 360px phone are unreadable and untappable, so the
 * layout is recomposed instead of scaled.
 */

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/report", label: "Report Problem" },
  { href: "/dashboard/reports", label: "My Reports" },
  { href: "/dashboard/reports", label: "Track Issues" },
  { href: "/gov/login", label: "Authority Portal" },
  { href: "#about", label: "About Us" },
];

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3 sm:px-8">
        <Link href="/" className="shrink-0" aria-label="CivicAI Pakistan — home">
          <CivicAILogo markClassName="size-10" />
        </Link>

        <nav
          aria-label="Main"
          className="ms-6 hidden items-center gap-0.5 xl:flex"
        >
          {LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-[0.875rem] font-medium text-ink/80 transition-colors hover:bg-civic-50 hover:text-civic-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          {/*
            Language is a first-class control, not a footer afterthought: a
            large share of citizens will read the Urdu interface, and burying
            the switch is how they never find it.

            This was a placeholder that said "English" and did nothing. It is
            now wired to the dictionary — and it shows both languages side by
            side rather than opening a menu, because a dropdown has to be
            understood before it can be opened, which is no use to the person
            it is offering something to.
          */}
          <LanguageToggle />

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex size-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-canvas xl:hidden"
          >
            {open ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "border-t border-line bg-surface xl:hidden",
          open ? "block" : "hidden",
        )}
      >
        <nav aria-label="Main" className="mx-auto grid max-w-7xl gap-1 px-5 py-3 sm:px-8">
          {LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-[var(--radius-field)] px-3 py-3 text-[0.9375rem] font-medium text-ink transition-colors hover:bg-canvas"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
