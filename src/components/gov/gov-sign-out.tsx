"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth-client";

/*
 * The desktop sidebar's sign-out — always visible, since the sidebar it
 * lives in is already permanent (unlike GovMobileMenu's, which is a
 * disclosure). Same action, same redirect target, as the one inside that
 * mobile menu; kept as its own small component rather than a third copy of
 * the handler, because the sidebar's dark, always-on placement genuinely
 * wants different markup from a row inside a light dropdown panel.
 */
export function GovSignOut() {
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
      className="mt-1.5 flex min-h-9 w-full items-center gap-2.5 rounded-[10px] px-3 text-[0.8125rem] font-medium text-white/65 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-55"
    >
      <LogOut className="size-4 shrink-0" aria-hidden="true" />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
