"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { signOut } from "@/lib/auth-client";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { OfficerDto } from "@/lib/gov/schema";

const t = getDictionary();

/*
 * Signing out of the government portal.
 *
 * Deliberately its own component rather than a reuse of the citizen
 * SignOutButton: an officer lands back at /gov/login, not the citizen sign-in
 * page. Sending them to the wrong door is a small thing that reads as being
 * shown someone else's app.
 */
export function GovSignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleSignOut() {
    setPending(true);
    try {
      await signOut();
      router.push("/gov/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="secondary"
      onClick={handleSignOut}
      loading={pending}
      className={className}
    >
      {!pending ? <LogOut className="size-4" aria-hidden="true" /> : null}
      {pending ? t.home.signingOut : t.home.signOut}
    </Button>
  );
}

/*
 * The account control in the top bar.
 *
 * Two plain buttons rather than a dropdown, and that is the point. A menu
 * hides both actions behind a click and a guess about which icon opens it;
 * these are the only two account actions the portal has, so showing both
 * costs a few pixels and removes the guess entirely. On narrow screens the
 * labels drop away and the icons remain, which is the same two targets in
 * less room — never a third state where an action disappears.
 */
export function GovAccountMenu({
  officer,
  className,
}: {
  officer: OfficerDto;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 sm:gap-1.5", className)}>
      <Link
        href="/gov/account"
        className="inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-[0.8125rem] font-medium text-muted transition-colors hover:bg-canvas hover:text-ink sm:px-2.5"
      >
        <span className="hidden sm:inline-flex">
          <Avatar name={officer.name} size="md" />
        </span>
        <UserRound className="size-5 sm:hidden" aria-hidden="true" />
        <span className="hidden lg:inline">Profile</span>
      </Link>

      <GovTopBarSignOut />
    </div>
  );
}

/** Sign-out as a top-bar icon button, labelled only where there is room. */
function GovTopBarSignOut() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleSignOut() {
    setPending(true);
    try {
      await signOut();
      router.push("/gov/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      aria-label={t.home.signOut}
      className="inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-[0.8125rem] font-medium text-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-60 sm:px-2.5"
    >
      <LogOut className="size-5" aria-hidden="true" />
      <span className="hidden lg:inline">
        {pending ? t.home.signingOut : t.home.signOut}
      </span>
    </button>
  );
}
