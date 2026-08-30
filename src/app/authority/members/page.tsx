import { Users } from "lucide-react";

import { requireAuthorityViewer } from "@/lib/authority/access";
import {
  listAuthorityMembers,
  listDepartmentMembers,
  listDepartments,
} from "@/lib/authority/queries";

export const dynamic = "force-dynamic";

/*
 * The people, grouped by department.
 *
 * Flat within each group and unordered by anything resembling seniority —
 * there is no rank in CivicAI, so the list is alphabetical and every row looks
 * exactly like every other. A member sees only their own departments; an admin
 * sees the whole authority.
 */
export default async function MembersPage() {
  const viewer = await requireAuthorityViewer();
  const authorityId = viewer.authorityIds[0];
  if (!authorityId) return null;

  const departments = await listDepartments(authorityId);

  const members = viewer.isAdmin
    ? await listAuthorityMembers(authorityId)
    : (
        await Promise.all(viewer.departmentIds.map((id) => listDepartmentMembers(id)))
      ).flat();

  const visibleDepartments = viewer.isAdmin
    ? departments
    : departments.filter((dept) => viewer.departmentIds.includes(dept.id));

  const admins = members.filter((m) => m.accessType === "authority_admin");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-bold tracking-tight text-ink">Members</h1>
        <p className="mt-1 text-[0.875rem] text-muted">
          {viewer.isAdmin
            ? "Everyone in this authority. Within a department all members are peers — the Member ID is an identifier, not a rank."
            : "The people in your department. All members are peers; the Member ID is an identifier, not a rank."}
        </p>
      </header>

      {viewer.isAdmin && admins.length > 0 ? (
        <Group
          title="Authority administrators"
          subtitle="Manage departments and members. Not scoped to one department."
          members={admins}
        />
      ) : null}

      {visibleDepartments.map((dept) => (
        <Group
          key={dept.id}
          title={dept.name}
          subtitle={dept.description ?? undefined}
          members={members.filter((m) => m.departmentId === dept.id)}
        />
      ))}
    </div>
  );
}

function Group({
  title,
  subtitle,
  members,
}: {
  title: string;
  subtitle?: string;
  members: { id: string; displayName: string; memberCode: string }[];
}) {
  return (
    <section className="rounded-[20px] border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
          <Users className="size-4 text-civic-700" aria-hidden="true" />
          {title}
          <span className="font-normal text-muted">({members.length})</span>
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">{subtitle}</p>
        ) : null}
      </div>

      <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0 sm:[&:nth-last-child(-n+2)]:border-0"
          >
            <span className="text-[0.875rem] font-medium text-ink">
              {member.displayName}
            </span>
            <span className="font-mono text-[0.75rem] text-muted">{member.memberCode}</span>
          </li>
        ))}
        {members.length === 0 ? (
          <li className="px-4 py-6 text-[0.875rem] text-muted">No members yet.</li>
        ) : null}
      </ul>
    </section>
  );
}
