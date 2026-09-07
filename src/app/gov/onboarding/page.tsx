import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, MailCheck, UserPlus } from "lucide-react";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { Card, CardBody } from "@/components/ui/card";
import { InviteRedeemForm } from "@/components/gov/invite-redeem-form";
import { ROLE_HOME } from "@/lib/gov/schema";
import { findOfficerByUserId } from "@/lib/gov/session";
import { getSession } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export const metadata: Metadata = { title: "Authority onboarding" };
export const dynamic = "force-dynamic";

/*
 * Where "Authority Registration / Onboarding" actually goes.
 *
 * The landing page offers that button because the design calls for it, but
 * there is no authority self-registration in this product and there should not
 * be: an officer account carries a role scoped to a real organization and
 * department, and letting anyone mint one from a public form would make the
 * whole authorization model decorative.
 *
 * So this page does the honest thing instead of the convenient one. It names
 * the three situations somebody pressing that button can actually be in —
 * holding an invitation, needing one from their own administrator, or working
 * for an authority that is not on CivicAI at all — and gives a real next step
 * for each. Only the first is self-service, and it is the invite redemption
 * that already exists.
 *
 * It deliberately does NOT offer a "request access" form. There is no table
 * behind one and no email provider to deliver it, so the form would accept a
 * request and drop it, which is worse than saying plainly who to contact.
 */
export default async function GovOnboardingPage() {
  const session = await getSession();

  // An officer who already has access has no business on an onboarding page.
  if (session) {
    const officer = await findOfficerByUserId(session.user.id);
    if (officer) redirect(ROLE_HOME[officer.role]);
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-10">
        <div className="mb-7 flex flex-col items-center text-center">
          <CivicAILogo />
          <span className="mt-3 rounded-full bg-civic-50 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-civic-700">
            {t.gov.onboarding.eyebrow}
          </span>
        </div>

        <Card>
          <CardBody>
            <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight text-ink">
              {t.gov.onboarding.title}
            </h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
              {t.gov.onboarding.subtitle}
            </p>

            {/* -- The one self-service path ------------------------------- */}
            <section className="mt-7 rounded-[var(--radius-card)] border border-civic-200 bg-civic-50/60 p-5">
              <h2 className="flex items-center gap-2.5 text-[0.9375rem] font-semibold text-ink">
                <MailCheck className="size-4.5 text-civic-700" aria-hidden="true" />
                {t.gov.onboarding.haveInviteTitle}
              </h2>
              <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
                {t.gov.onboarding.haveInviteBody}
              </p>

              <div className="mt-4">
                <InviteRedeemForm />
              </div>
            </section>

            {/* -- The two that need a person ------------------------------ */}
            <div className="mt-5 grid gap-3">
              <NextStep
                icon={<UserPlus className="size-4.5" aria-hidden="true" />}
                title={t.gov.onboarding.noInviteTitle}
                body={t.gov.onboarding.noInviteBody}
              />
              <NextStep
                icon={<Building2 className="size-4.5" aria-hidden="true" />}
                title={t.gov.onboarding.newOrgTitle}
                body={t.gov.onboarding.newOrgBody}
              />
            </div>

            <p className="mt-7 border-t border-line pt-5 text-center text-[0.875rem] text-muted">
              {t.gov.onboarding.alreadyHaveAccount}{" "}
              <Link
                href="/gov/login"
                className="font-semibold text-civic-700 hover:underline"
              >
                {t.gov.onboarding.signIn}
              </Link>
            </p>
          </CardBody>
        </Card>
      </main>
    </div>
  );
}

/** One route that needs a human, stated with who that human is. */
function NextStep({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <span className="mt-0.5 shrink-0 text-civic-700">{icon}</span>
      <div className="min-w-0">
        <h2 className="text-[0.875rem] font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}
