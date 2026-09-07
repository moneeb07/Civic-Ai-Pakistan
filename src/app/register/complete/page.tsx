import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { SuccessAnnouncement } from "@/components/registration/success-announcement";
import { CivicAILogo } from "@/components/brand/civicai-logo";
import { Button } from "@/components/ui/button";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";


export const dynamic = "force-dynamic";

/*
 * Reached only after /api/registration/complete has created a real account and
 * set a real session. If there is no session, the registration did not finish —
 * so there is nothing to celebrate and the citizen goes back to the flow.
 */
export default async function CompletePage() {
  const t = await getRequestDictionary();
  const session = await getSession();
  if (!session) redirect("/register");

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-md animate-rise text-center">
        <CivicAILogo className="mb-10 justify-center" />

        <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-civic-100">
          <CheckCircle2 className="size-10 text-civic-600" aria-hidden="true" />
        </span>

        <p className="mt-7 text-3xl" aria-hidden="true">
          🇵🇰
        </p>

        <h1 className="mt-3 text-[1.875rem] font-semibold leading-tight tracking-tight text-ink">
          {t.success.title}
        </h1>

        <p className="mt-3 text-base text-muted">{t.success.body}</p>

        <p className="mt-1.5 text-[0.9375rem] font-medium text-ink">
          {session.user.name}
        </p>

        <Button asChild size="full" className="mt-8">
          <Link href="/dashboard">{t.success.action}</Link>
        </Button>
      </div>

      <SuccessAnnouncement />
    </div>
  );
}
