import { notFound } from "next/navigation";

import { IssueList } from "@/components/authority/issue-list";
import { IssueSearch } from "@/components/authority/issue-search";
import { MemberRoster } from "@/components/authority/member-roster";
import { StatGrid } from "@/components/authority/stat-grid";
import { canAccessDepartment, requireAuthorityViewer } from "@/lib/authority/access";
import {
  getAuthorityStats,
  getDepartment,
  listDepartmentMembers,
  listIssues,
} from "@/lib/authority/queries";
import { ISSUE_STATUSES, type IssueStatus } from "@/lib/authority/schema";

export const dynamic = "force-dynamic";

/*
 * The department member's workspace: only their department's issues.
 *
 * A member who tries another department's id gets a 404 rather than a 403 —
 * the existence of a department they cannot open is not something they need
 * confirmed.
 */
export default async function DepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const viewer = await requireAuthorityViewer();
  const { id } = await params;
  const { q, status } = await searchParams;

  const dept = await getDepartment(id);
  if (!dept || !canAccessDepartment(viewer, dept.authorityId, dept.id)) notFound();

  const validStatus = ISSUE_STATUSES.includes(status as IssueStatus)
    ? (status as IssueStatus)
    : undefined;

  const [stats, members, issues] = await Promise.all([
    getAuthorityStats(dept.authorityId, [dept.id]),
    listDepartmentMembers(dept.id),
    listIssues({
      authorityId: dept.authorityId,
      departmentIds: [dept.id],
      status: validStatus,
      search: q,
    }),
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
      </header>

      <StatGrid stats={stats} />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section className="space-y-4">
          <IssueSearch basePath={`/authority/departments/${dept.id}`} />
          <IssueList issues={issues} />
        </section>

        <MemberRoster members={members} categories={dept.categories} />
      </div>
    </div>
  );
}
