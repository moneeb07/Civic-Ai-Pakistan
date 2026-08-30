import { notFound } from "next/navigation";

import { AddMemberForm } from "@/components/authority/add-member-form";
import { IssueList } from "@/components/authority/issue-list";
import { MemberRoster } from "@/components/authority/member-roster";
import { StatGrid } from "@/components/authority/stat-grid";
import { canAccessDepartment, requireAuthorityAdmin } from "@/lib/authority/access";
import {
  getAuthorityStats,
  getDepartment,
  listDepartmentMembers,
  listIssues,
} from "@/lib/authority/queries";

export const dynamic = "force-dynamic";

/** One department, as the admin sees it: its statistics, members and issues. */
export default async function AdminDepartmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireAuthorityAdmin();
  const { id } = await params;

  const dept = await getDepartment(id);
  // Re-checked here, not merely inherited from the layout: an admin of one
  // authority must not be able to open another authority's department by id.
  if (!dept || !canAccessDepartment(viewer, dept.authorityId, dept.id)) notFound();

  const [stats, members, issues] = await Promise.all([
    getAuthorityStats(dept.authorityId, [dept.id]),
    listDepartmentMembers(dept.id),
    listIssues({ authorityId: dept.authorityId, departmentIds: [dept.id] }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-muted">
          {dept.authorityName}
        </p>
        <h1 className="mt-0.5 text-[1.375rem] font-bold tracking-tight text-ink">
          {dept.name}
        </h1>
        {dept.description ? (
          <p className="mt-1 text-[0.875rem] text-muted">{dept.description}</p>
        ) : null}
      </header>

      <StatGrid stats={stats} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section>
          <h2 className="mb-3 text-[1rem] font-semibold text-ink">Issues</h2>
          <IssueList issues={issues} />
        </section>

        <div className="space-y-3">
          <MemberRoster members={members} categories={dept.categories} />
          <AddMemberForm departmentId={dept.id} />
        </div>
      </div>
    </div>
  );
}
