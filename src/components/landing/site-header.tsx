"use client";

import * as React from "react";
import Link from "next/link";
import { Globe, Menu, X } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * The public header.
 *
 * Signed-out only — once someone is authenticated they are inside the citizen
 * or government shell, each of which carries its own navigation. Mixing the
 * two would leave a signed-in officer looking at marketing links.
 *
 * On small screens the nav becomes a disclosure rather than a shrunken row:
 * five links squeezed onto a 360px phone are unreadable and untappable, so the
 * layout is recomposed instead of scaled.
 */

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "/performance", label: "Authority performance" },
  { href: "#for-authorities", label: "For authorities" },
];

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3 sm:px-8">
        <Link href="/" className="shrink-0" aria-label="CivicAI Pakistan — home">
          <CivicAILogo showCountry={false} markClassName="size-9" />
        </Link>

        <nav aria-label="Main" className="ms-4 hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-[0.875rem] font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          {/*
            Language is a first-class control, not a footer afterthought: a
            large share of citizens will read the Urdu interface, and burying
            the switch is how they never find it. Wired to the dictionary in a
            later pass; it announces itself honestly until then.
          */}
          <button
            type="button"
            className="hidden items-center gap-1.5 rounded-full border border-line-strong px-3 py-2 text-[0.8125rem] font-medium text-ink transition-colors hover:bg-canvas sm:inline-flex"
          >
            <Globe className="size-3.5 text-muted" aria-hidden="true" />
            English
          </button>

          <Button asChild variant="secondary" className="hidden min-h-10 px-4 text-[0.875rem] sm:inline-flex">
            <Link href="/auth/sign-in">Sign in</Link>
          </Button>
          <Button asChild className="min-h-10 px-4 text-[0.875rem]">
            <Link href="/register">Get started</Link>
          </Button>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex size-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-canvas lg:hidden"
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "border-t border-line bg-surface lg:hidden",
          open ? "block" : "hidden",
        )}
      >
        <nav aria-label="Main" className="mx-auto grid max-w-7xl gap-1 px-5 py-3 sm:px-8">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-[var(--radius-field)] px-3 py-3 text-[0.9375rem] font-medium text-ink transition-colors hover:bg-canvas"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/auth/sign-in"
            onClick={() => setOpen(false)}
            className="rounded-[var(--radius-field)] px-3 py-3 text-[0.9375rem] font-medium text-ink transition-colors hover:bg-canvas sm:hidden"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
