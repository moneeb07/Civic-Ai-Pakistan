import { ResolutionDonut } from "@/components/civic/resolution-donut";
import { StatGrid } from "@/components/authority/stat-grid";
import { requireAuthorityViewer } from "@/lib/authority/access";
import {
  categoryBreakdown,
  getAuthorityStats,
  listDepartments,
} from "@/lib/authority/queries";
import { categoryLabel } from "@/lib/authority/schema";

export const dynamic = "force-dynamic";

/*
 * Where the work actually is.
 *
 * Scoped exactly like every other page: an admin sees the whole authority, a
 * member sees only their own departments. The department workload table is the
 * useful part — it shows an admin which section is carrying the load, which is
 * invisible from the issue list.
 */
export default async function AnalyticsPage() {
  const viewer = await requireAuthorityViewer();
  const authorityId = viewer.authorityIds[0];
  if (!authorityId) return null;

  const scope = viewer.isAdmin ? undefined : viewer.departmentIds;

  const [stats, categories, departments] = await Promise.all([
    getAuthorityStats(authorityId, scope),
    categoryBreakdown(authorityId, scope),
    listDepartments(authorityId),
  ]);

  const visibleDepartments = viewer.isAdmin
    ? departments
    : departments.filter((dept) => viewer.departmentIds.includes(dept.id));

  const maxReports = Math.max(1, ...categories.map((row) => row.reports));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-bold tracking-tight text-ink">Analytics</h1>
        <p className="mt-1 text-[0.875rem] text-muted">
          {viewer.isAdmin
            ? "Across the whole authority."
            : "Across your departments."}
        </p>
      </header>

      <StatGrid stats={stats} />

      <section className="rounded-[20px] border border-line bg-surface p-5">
        <h2 className="text-[1rem] font-semibold text-ink">Issue status</h2>
        <div className="mt-4">
          <ResolutionDonut
            reported={stats.reported}
            inProcess={stats.inProcess}
            resolved={stats.resolved}
          />
        </div>
      </section>

      <section className="rounded-[20px] border border-line bg-surface p-5">
        <h2 className="text-[1rem] font-semibold text-ink">Reports by category</h2>
        <p className="mt-1 text-[0.8125rem] text-muted">
          Citizen reports behind each kind of problem — the scale of the demand,
          not just the number of tickets.
        </p>

        <ul className="mt-4 space-y-2.5">
          {categories.map((row) => (
            <li key={row.category}>
              <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                <span className="font-medium text-ink">{categoryLabel(row.category)}</span>
                <span className="text-muted">
                  {row.reports} reports · {row.issues} issues · {row.resolved} resolved
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                <div
                  className="h-full rounded-full bg-civic-500"
                  style={{ width: `${(row.reports / maxReports) * 100}%` }}
                />
              </div>
            </li>
          ))}
          {categories.length === 0 ? (
            <li className="text-[0.875rem] text-muted">Nothing reported yet.</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-[20px] border border-line bg-surface p-5">
        <h2 className="text-[1rem] font-semibold text-ink">Department workload</h2>
        <ul className="mt-4 space-y-2.5">
          {visibleDepartments.map((dept) => (
            <li
              key={dept.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2.5 last:border-0 last:pb-0"
            >
              <span className="text-[0.875rem] font-medium text-ink">{dept.name}</span>
              <span className="text-[0.8125rem] text-muted">
                {dept.issueCount} issues · {dept.openCount} open · {dept.memberCount} members
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
