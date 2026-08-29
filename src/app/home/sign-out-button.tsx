"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);

    try {
      await signOut();
      router.push("/auth/sign-in");
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
