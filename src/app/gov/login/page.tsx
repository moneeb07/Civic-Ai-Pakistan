import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { Card, CardBody } from "@/components/ui/card";
import { GovLoginForm } from "@/components/gov/login-form";
import { ROLE_HOME } from "@/lib/gov/schema";
import { findOfficerByUserId } from "@/lib/gov/session";
import { getSession } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export const metadata: Metadata = { title: "Government sign in" };
export const dynamic = "force-dynamic";

/*
 * The portal's only public entry point besides an invite link.
 *
 * An already-signed-in officer is sent to their own dashboard rather than
 * shown a login form. A signed-in CITIZEN, however, is not redirected: they
 * have a valid session and no officer record, so they are told plainly that
 * this account has no government access instead of being bounced somewhere
 * that would 404 or look like a permissions bug.
 */
export default async function GovLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const session = await getSession();

  if (session) {
    const officer = await findOfficerByUserId(session.user.id);
    if (officer) redirect(ROLE_HOME[officer.role]);
  }

  // requireOfficer() sends a signed-in non-officer here with ?reason=no_access.
  const initialError =
    reason === "no_access" || (session && !reason) ? t.gov.login.noAccess : undefined;

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <div className="mb-7 flex flex-col items-center text-center">
          <CivicAILogo />
          <span className="mt-3 rounded-full bg-civic-50 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-civic-700">
            {t.gov.portalName}
          </span>
        </div>

        <Card>
          <CardBody>
            <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight text-ink">
              {t.gov.login.title}
            </h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
              {t.gov.login.subtitle}
            </p>

            <div className="mt-6">
              <GovLoginForm initialError={initialError} />
            </div>
          </CardBody>
        </Card>
      </main>
    </div>
  );
}
