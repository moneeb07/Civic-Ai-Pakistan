"use client";

import * as React from "react";
import Link from "next/link";
import { Lock, Menu, X } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { Button } from "@/components/ui/button";

/*
 * The transparent header that sits directly on the hero photograph.
 *
 * Logo, language switch, and the two authority/citizen entry points — the
 * same three things as before. What changed is WHERE the last two live on a
 * phone: below `sm` they no longer sit in the header row at all. A photo
 * this detailed leaves little clear sky in a 56px-tall strip, and two more
 * controls squeezed into it were the first things to get illegibly small.
 * They move into a disclosure behind a hamburger button instead — still one
 * tap away, no longer fighting the logo for the same few pixels.
 *
 * "Get Started" and "Sign In" are not lost by hiding them here: both exist
 * as full-size buttons in the hero body a few lines down, which is where a
 * thumb already is on a phone. The hamburger's job is Authority Sign In and
 * the language switch — the two controls that have no other way in.
 *
 * This is a separate component from `SiteHeader`, not a themed variant of it.
 * `SiteHeader` is shared with `/performance`, a page with no photographic
 * backdrop and no reason to change; forking the visual here keeps that page
 * untouched instead of threading a "transparent" branch through a component
 * something else depends on. It reuses what actually is shared — the logo
 * mark and the `Button` component — rather than redrawing them.
 */
export function HeroHeader() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-5 py-4 sm:gap-3 sm:px-8">
        <Link href="/" className="shrink-0" aria-label="CivicAI Pakistan — home">
          <CivicAILogo markClassName="size-8 sm:size-9" className="gap-2 sm:gap-3" />
        </Link>

        <div className="ms-auto flex items-center gap-1.5 sm:gap-2">

          {/* Authority Sign In and Get Started: sm and up only, in the row. */}
          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden bg-surface/95 px-2.5 shadow-sm backdrop-blur sm:inline-flex sm:px-4"
          >
            <Link href="/gov/login">
              <Lock className="size-3.5" aria-hidden="true" />
              Authority Sign In
            </Link>
          </Button>

          <Button asChild size="sm" className="hidden px-3.5 shadow-md sm:inline-flex sm:px-4">
            <Link href="/register">Get Started</Link>
          </Button>

          {/* The hamburger: below sm only, where the row above just hid two controls. */}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="hero-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex size-10 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm backdrop-blur transition-colors hover:bg-surface sm:hidden"
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/*
        The one place this header stops being transparent, and the same
        reason SiteHeader's own mobile disclosure is opaque: three controls
        floating over a busy photograph with no surface under them would be
        unreadable, so this gets a solid panel the moment it opens.
      */}
      {open ? (
        <div
          id="hero-mobile-menu"
          className="border-b border-line bg-surface shadow-lg sm:hidden"
        >
          <div className="flex flex-col gap-2 px-5 py-4">

            <Link
              href="/gov/login"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-2 rounded-[var(--radius-field)] px-3 text-[0.9375rem] font-medium text-ink transition-colors hover:bg-canvas"
            >
              <Lock className="size-4 text-muted" aria-hidden="true" />
              Authority Sign In
            </Link>

            <Button asChild size="full" className="mt-1">
              <Link href="/register" onClick={() => setOpen(false)}>
                Get Started
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
