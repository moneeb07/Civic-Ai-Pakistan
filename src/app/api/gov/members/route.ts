import { getOfficer } from "@/lib/gov/session";
import { ok, unauthorized } from "@/lib/gov/api";
import { listDepartmentMembers } from "@/lib/gov/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/gov/members — the officers in the caller's OWN department.
 *
 * Exists so the mobile assign picker has a roster; the web reads the same
 * function server-side on /gov/dept.
 *
 * The department is taken from the caller's own officer record and never from
 * a query parameter. That is the whole security design of this route: with a
 * `?deptId=` an officer could enumerate the staff of any department in the
 * country, and a roster of names and emails is exactly the kind of thing that
 * looks harmless until it is scraped.
 *
 * A platform admin or org head has no department of their own, so they get an
 * empty roster rather than everyone's — assignment is a departmental act.
 */
export async function GET() {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { deptId } = context.officer;
  if (!deptId) return ok([]);

  const members = await listDepartmentMembers(deptId);

  // Only what a picker needs. Roles are included because the UI distinguishes
  // assignable members from the dept head who is doing the assigning.
  return ok(
    members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
    })),
  );
}
