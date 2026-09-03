import type { Metadata } from "next";
import Link from "next/link";

import { CivicAILogo } from "@/components/brand/civicai-logo";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardEyebrow } from "@/components/ui/card";
import { InviteAcceptForm } from "@/components/gov/invite-accept-form";
import { lookupInviteByToken } from "@/lib/gov/invites";
import { getDictionary } from "@/lib/i18n";
import { formatTimestamp } from "@/lib/gov/format";

const t = getDictionary();

export const metadata: Metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

/*
 * The invite acceptance screen.
 *
 * Public by design — an invited officer has no account yet, so there is no
 * session to check. The token is the credential, and it is validated
 * server-side here and AGAIN in the accept route: rendering this form is not
 * permission to create an account.
 *
 * An invalid, expired or used token renders a friendly card explaining which
 * of the three it was and what to do about it, rather than a bare 404 that
 * would leave the person guessing whether they mistyped the link.
 */
export default async function GovInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = await lookupInviteByToken(token);

  if (lookup.status !== "valid") {
    const copy =
      lookup.status === "expired"
        ? { title: t.gov.invite.expiredTitle, body: t.gov.invite.expiredBody }
        : lookup.status === "used"
          ? { title: t.gov.invite.usedTitle, body: t.gov.invite.usedBody }
          : { title: t.gov.invite.invalidTitle, body: t.gov.invite.invalidBody };

    return (
      <InviteShell>
        <Card>
          <CardBody>
            <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight text-ink">
              {copy.title}
            </h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{copy.body}</p>
            <Button asChild variant="secondary" size="full" className="mt-6">
              <Link href="/gov/login">{t.gov.invite.backToLogin}</Link>
            </Button>
          </CardBody>
        </Card>
      </InviteShell>
    );
  }

  const { invite, orgName, deptName } = lookup;

  return (
    <InviteShell>
      <Card>
        <CardBody>
          <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight text-ink">
            {t.gov.invite.acceptTitle}
          </h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
            {t.gov.invite.acceptSubtitle}
          </p>

          {/*
            Read-only summary of exactly what this grants. Someone activating a
            government account should be able to see the scope they are
            accepting before they set a password, not discover it afterwards.
          */}
          <div className="mt-6 rounded-[18px] border border-line bg-canvas p-4">
            <CardEyebrow>{t.gov.invite.grantsEyebrow}</CardEyebrow>
            <dl className="mt-3 space-y-2 text-[0.875rem]">
              <SummaryRow label={t.gov.invite.emailLabel} value={invite.email} />
              <SummaryRow label={t.gov.invite.roleLabel} value={t.gov.roles[invite.role]} />
              {orgName ? <SummaryRow label={t.gov.invite.orgLabel} value={orgName} /> : null}
              {deptName ? <SummaryRow label={t.gov.invite.deptLabel} value={deptName} /> : null}
              <SummaryRow
                label={t.gov.invite.expiresLabel}
                value={formatTimestamp(invite.expiresAt.toISOString())}
              />
            </dl>
          </div>

          <div className="mt-6">
            <InviteAcceptForm token={token} />
          </div>
        </CardBody>
      </Card>
    </InviteShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <div className="mb-7 flex flex-col items-center text-center">
          <CivicAILogo />
          <span className="mt-3 rounded-full bg-civic-50 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-civic-700">
            {t.gov.portalName}
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}
