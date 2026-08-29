import { ok, withOfficer } from "@/lib/gov/api";
import {
  listDepartmentComplaints,
  listMemberComplaints,
  listOrganizationComplaints,
  listUnroutedComplaints,
} from "@/lib/gov/complaints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/gov/complaints — the caller's queue, chosen by their role.
 *
 * There is no `scope` query parameter: an officer cannot ask for a queue that
 * isn't theirs, because the role decides which query runs and each query
 * carries its own org/dept filter in SQL.
 *
 *   platform_admin — everything still waiting to be routed
 *   org_head       — their organization's routed complaints + the unrouted inbox
 *   dept_head      — their department's queue
 *   member         — only what is assigned to them
 */
export const GET = withOfficer(async ({ officer }) => {
  if (officer.role === "platform_admin") {
    return ok({ unrouted: await listUnroutedComplaints(), assigned: [] });
  }

  if (officer.role === "org_head" && officer.orgId) {
    const [unrouted, assigned] = await Promise.all([
      listUnroutedComplaints(),
      listOrganizationComplaints(officer.orgId),
    ]);
    return ok({ unrouted, assigned });
  }

  if (officer.role === "dept_head" && officer.deptId) {
    return ok({ unrouted: [], assigned: await listDepartmentComplaints(officer.deptId) });
  }

  if (officer.role === "member" && officer.deptId) {
    return ok({ unrouted: [], assigned: await listMemberComplaints(officer.deptId, officer.id) });
  }

  return ok({ unrouted: [], assigned: [] });
});
