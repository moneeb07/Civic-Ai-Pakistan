import Link from "next/link";
import { ArrowRight, Building2, Users } from "lucide-react";

import { IssueList } from "@/components/authority/issue-list";
import { StatGrid } from "@/components/authority/stat-grid";
import { CreateDepartmentForm } from "@/components/authority/create-department-form";
import { requireAuthorityAdmin, adminMembership } from "@/lib/authority/access";
import {
  getAuthorityStats,
  listDepartments,
  listIssues,
} from "@/lib/authority/queries";
import { categoryLabel } from "@/lib/authority/schema";

export const dynamic = "force-dynamic";

/*
 * The authority admin dashboard: the whole authority at a glance, then the
 * departments, then the busiest issues across all of them.
 */
export default async function AuthorityAdminPage() {
  const viewer = await requireAuthorityAdmin();
  const admin = adminMembership(viewer);
  if (!admin) return null;

  const [stats, departments, issues] = await Promise.all([
    getAuthorityStats(admin.authorityId),
    listDepartments(admin.authorityId),
    listIssues({ authorityId: admin.authorityId, limit: 8 }),
  ]);

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-[1.375rem] font-bold tracking-tight text-ink">
          {admin.authorityName}
        </h1>
        <p className="mt-1 text-[0.875rem] text-muted">
          Every department, every issue, and how citizen reports were grouped.
        </p>
      </header>

      <StatGrid stats={stats} />

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Building2 className="size-4 text-civic-700" aria-hidden="true" />
          <h2 className="text-[1rem] font-semibold text-ink">Departments</h2>
          <span className="flex-1" />
          <CreateDepartmentForm />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {departments.map((dept) => (
            <Link
              key={dept.id}
              href={`/authority/admin/departments/${dept.id}`}
              className="rounded-[18px] border border-line bg-surface p-4 transition-colors hover:border-civic-200 hover:bg-civic-50/40"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[0.9375rem] font-semibold text-ink">{dept.name}</h3>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
              </div>

              {dept.description ? (
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
                  {dept.description}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5" aria-hidden="true" />
                  {dept.memberCount} members
                </span>
                <span>{dept.issueCount} issues</span>
                <span>{dept.openCount} open</span>
              </div>

              {/* The routing rule, stated plainly — this is what decides where
                  reports land, so an admin should never have to guess it. */}
              <p className="mt-2.5 text-[0.75rem] leading-relaxed text-muted">
                Receives:{" "}
                {dept.categories.length > 0
                  ? dept.categories.map((c) => categoryLabel(c)).join(", ")
                  : "nothing yet — no categories assigned"}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[1rem] font-semibold text-ink">Most reported issues</h2>
          <span className="flex-1" />
          <Link
            href="/authority/issues"
            className="text-[0.8125rem] font-medium text-civic-700 hover:underline"
          >
            View all
          </Link>
        </div>
        <IssueList issues={issues} />
      </section>
    </div>
  );
}
