import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GovPageHeading, GovShell } from "@/components/gov/gov-shell";
import { DeptManager } from "@/components/gov/dept-manager";
import { InviteManager } from "@/components/gov/invite-manager";
import { OrgComplaintList } from "@/components/gov/org-complaint-list";
import { RoutingInbox } from "@/components/gov/routing-inbox";
import { ToastProvider } from "@/components/gov/toast";
import { listOrganizationComplaints, listUnroutedComplaints } from "@/lib/gov/complaints";
import { listPendingInvites } from "@/lib/gov/invites";
import { ROLE_HOME } from "@/lib/gov/schema";
import { requireOfficer } from "@/lib/gov/session";
import { listDepartments } from "@/lib/gov/store";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export const metadata: Metadata = { title: "Organization" };
export const dynamic = "force-dynamic";

/*
 * The organization head's dashboard: their departments, the invitations they
 * have out, and the complaints waiting to be routed.
 *
 * Every query below is scoped to officer.orgId, which the officer_role_scope
 * CHECK constraint guarantees is non-null for this role.
 */
export default async function GovOrgPage() {
  const { officer } = await requireOfficer();

  if (officer.role !== "org_head") redirect(ROLE_HOME[officer.role]);
  if (!officer.orgId) redirect("/gov/login?reason=no_access");

  const [depts, invites, unrouted, allComplaints] = await Promise.all([
    listDepartments(officer.orgId),
    listPendingInvites(officer.id, false),
    listUnroutedComplaints(),
    // Everything already routed anywhere in this organization — scoped to
    // officer.orgId inside the query, not filtered here.
    listOrganizationComplaints(officer.orgId),
  ]);

  return (
    <ToastProvider>
      <GovShell officer={officer}>
        <GovPageHeading
          title={officer.orgName ?? t.gov.org.title}
          subtitle={t.gov.org.subtitle}
        />

        <RoutingInbox complaints={unrouted} departments={depts} />

        <div className="mt-8">
          <OrgComplaintList complaints={allComplaints} />
        </div>

        <div className="mt-8">
          <DeptManager orgId={officer.orgId} initialDepts={depts} />
        </div>

        <div className="mt-8">
          {/*
            An org head invites department heads, and only into a department
            that already exists — so the form appears once there is somewhere
            to invite them to.
          */}
          {depts.length > 0 ? (
            <InviteManager
              role="dept_head"
              orgId={officer.orgId}
              deptId={null}
              deptOptions={depts.map((dept) => ({ id: dept.id, label: dept.name }))}
              initialInvites={invites}
            />
          ) : null}
        </div>
      </GovShell>
    </ToastProvider>
  );
}
