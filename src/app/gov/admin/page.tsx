import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GovPageHeading, GovShell } from "@/components/gov/gov-shell";
import { InviteManager } from "@/components/gov/invite-manager";
import { OrgManager } from "@/components/gov/org-manager";
import { ToastProvider } from "@/components/gov/toast";
import { ROLE_HOME } from "@/lib/gov/schema";
import { listPendingInvites } from "@/lib/gov/invites";
import { requireOfficer } from "@/lib/gov/session";
import { listOrganizationsForOfficer } from "@/lib/gov/store";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export const metadata: Metadata = { title: "Platform administration" };
export const dynamic = "force-dynamic";

/*
 * The platform administrator's dashboard: create organizations, invite their
 * heads, and hand each one over.
 *
 * Data is fetched on the server and passed down as initial state rather than
 * loaded by the client on mount — the first paint is the real content, so
 * there is no skeleton-then-swap for the page's primary data.
 */
export default async function GovAdminPage() {
  const { officer } = await requireOfficer();

  // Role is re-checked here, not just in the proxy: a dept head who types
  // /gov/admin belongs on their own dashboard, not on an empty admin screen.
  if (officer.role !== "platform_admin") redirect(ROLE_HOME[officer.role]);

  const [orgs, invites] = await Promise.all([
    listOrganizationsForOfficer(officer),
    listPendingInvites(officer.id, true),
  ]);

  return (
    <ToastProvider>
      <GovShell officer={officer}>
        <GovPageHeading title={t.gov.admin.title} subtitle={t.gov.admin.subtitle} />

        <OrgManager initialOrgs={orgs} />

        <div className="mt-8">
          {/*
            A platform admin invites organization heads. The org is chosen by
            the invite form only when one exists — with no organizations yet,
            there is no scope to invite into.
          */}
          {orgs.length > 0 ? (
            <InviteManager
              role="org_head"
              orgId={null}
              deptId={null}
              orgOptions={orgs.map((org) => ({ id: org.id, label: `${org.name} (${org.code})` }))}
              initialInvites={invites}
            />
          ) : null}
        </div>
      </GovShell>
    </ToastProvider>
  );
}
