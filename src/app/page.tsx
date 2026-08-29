import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import { getSession } from "@/lib/session";

const t = getDictionary();

export default async function LandingPage() {
  // A citizen who is already signed in has no reason to see the entry screen.
  if (await getSession()) {
    redirect("/dashboard");
  }

  return (
    <AuthShell>
      <AuthCard title={t.landing.title} subtitle={t.landing.subtitle}>
        <div className="space-y-3">
          <Button asChild size="full">
            <Link href="/register">
              {t.landing.createAccount}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>

          <Button asChild variant="secondary" size="full">
            <Link href="/auth/sign-in">{t.landing.signIn}</Link>
          </Button>
        </div>

        <p className="mt-7 border-t border-line pt-5 text-[0.8125rem] leading-relaxed text-muted">
          {t.brand.supporting}
        </p>
      </AuthCard>
    </AuthShell>
  );
}
