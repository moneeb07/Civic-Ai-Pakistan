import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, Building2, UserRound } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { CivicAILogo } from "@/components/brand/civicai-logo";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import { getSession } from "@/lib/session";

const t = getDictionary();

export const dynamic = "force-dynamic";

/*
 * The front door, for two very different audiences.
 *
 * CivicAI has a citizen half and an authority half, and someone arriving
 * cold has to be able to tell which one is theirs in a second. Previously
 * this page offered only "Create account" and "Sign in", which quietly
 * assumed everyone arriving was a citizen — a department member had no way in
 * except by knowing a URL.
 *
 * Both sign-in paths use the SAME authentication; the split here is about
 * intent, not a second login system. Where someone lands after signing in is
 * decided by what their account actually is, never by which button they
 * pressed.
 */
export default async function LandingPage() {
  if (await getSession()) redirect("/dashboard");

  return (
    <AuthShell>
      <div className="w-full">
        <div className="mb-7 text-center">
          <CivicAILogo className="mx-auto" />
          <h1 className="mt-5 text-[1.5rem] font-bold leading-tight tracking-tight text-ink">
            {t.landing.title}
          </h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
            {t.landing.subtitle}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* -- Citizen ------------------------------------------------- */}
          <section className="rounded-[20px] border border-civic-200 bg-civic-50/60 p-5">
            <span className="inline-flex size-10 items-center justify-center rounded-[14px] bg-civic-600 text-white">
              <UserRound className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-3 text-[1.0625rem] font-semibold tracking-tight text-ink">
              I am a citizen
            </h2>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
              Report a problem in your area, then track exactly what happens to it.
            </p>

            <div className="mt-4 space-y-2">
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
          </section>

          {/* -- Authority ----------------------------------------------- */}
          <section className="rounded-[20px] border border-line bg-surface p-5">
            <span className="inline-flex size-10 items-center justify-center rounded-[14px] bg-ink text-white">
              <Building2 className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-3 text-[1.0625rem] font-semibold tracking-tight text-ink">
              I work for an authority
            </h2>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
              Receive routed civic issues, collaborate with your department, and
              update progress.
            </p>

            <div className="mt-4 space-y-2">
              <Button asChild variant="secondary" size="full">
                <Link href="/auth/sign-in?next=/authority">
                  Authority sign in
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <p className="text-center text-[0.75rem] leading-relaxed text-muted">
                Accounts are created by your authority&rsquo;s administrator.
              </p>
            </div>
          </section>
        </div>

        {/* Public, and deliberately reachable without an account. */}
        <Link
          href="/performance"
          className="mt-3 flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5 transition-colors hover:border-civic-200 hover:bg-civic-50/40"
        >
          <BarChart3 className="size-4 shrink-0 text-civic-700" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.875rem] font-semibold text-ink">
              Authority performance
            </span>
            <span className="block text-[0.75rem] leading-relaxed text-muted">
              How each authority is doing — public, no account needed.
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
        </Link>

        <p className="mt-6 border-t border-line pt-5 text-center text-[0.8125rem] leading-relaxed text-muted">
          {t.brand.supporting}
        </p>
      </div>
    </AuthShell>
  );
}
