import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardEyebrow } from "@/components/ui/card";
import { DeptQueue } from "@/components/gov/dept-queue";
import { GovPageHeading, GovShell } from "@/components/gov/gov-shell";
import { InviteManager } from "@/components/gov/invite-manager";
import { EmptyState } from "@/components/gov/states";
import { ToastProvider } from "@/components/gov/toast";
import { listDepartmentComplaints } from "@/lib/gov/complaints";
import { listPendingInvites } from "@/lib/gov/invites";
import { ROLE_HOME } from "@/lib/gov/schema";
import { requireOfficer } from "@/lib/gov/session";
import { listDepartmentMembers } from "@/lib/gov/store";
import { getWorkflow } from "@/lib/gov/workflow";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export const metadata: Metadata = { title: "Department" };
export const dynamic = "force-dynamic";

/*
 * The department head's dashboard: the queue, the team, and the invitations
 * out to grow it. Everything is scoped to officer.deptId in SQL.
 */
export default async function GovDeptPage() {
  const { officer } = await requireOfficer();

  if (officer.role !== "dept_head") redirect(ROLE_HOME[officer.role]);
  if (!officer.deptId) redirect("/gov/login?reason=no_access");

  const [complaints, members, invites, workflow] = await Promise.all([
    listDepartmentComplaints(officer.deptId),
    listDepartmentMembers(officer.deptId),
    listPendingInvites(officer.id, false),
    getWorkflow(officer.deptId),
  ]);

  // A template has never been saved, so the department has no workflow yet.
  const hasWorkflow = !workflow.isTemplate;
  const assignable = members.filter((member) => member.role === "member");

  return (
    <ToastProvider>
      <GovShell officer={officer}>
        <GovPageHeading
          title={officer.deptName ?? t.gov.dept.title}
          subtitle={t.gov.dept.subtitle}
          action={
            <Button asChild variant={hasWorkflow ? "secondary" : "primary"}>
              <Link href="/gov/dept/workflow">
                {hasWorkflow ? t.gov.workflow.title : t.gov.dept.openWorkflow}
              </Link>
            </Button>
          }
        />

        <DeptQueue complaints={complaints} members={assignable} hasWorkflow={hasWorkflow} />

        <section className="mt-8">
          <CardEyebrow className="mb-3 block">{t.gov.dept.teamEyebrow}</CardEyebrow>

          {assignable.length === 0 ? (
            <EmptyState icon={Users} title={t.gov.dept.noTeamTitle} body={t.gov.dept.noTeamBody} />
          ) : (
            <ul className="space-y-2">
              {assignable.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center gap-4 rounded-[18px] border border-line bg-surface p-4"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-canvas text-muted">
                    <Users className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-semibold text-ink">
                      {member.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                      {member.email}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-8">
          <InviteManager
            role="member"
            orgId={officer.orgId}
            deptId={officer.deptId}
            initialInvites={invites}
          />
        </div>
      </GovShell>
    </ToastProvider>
  );
}
