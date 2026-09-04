import { getOfficer } from "@/lib/gov/session";
import { ok, unauthorized } from "@/lib/gov/api";
import { countUnrouted, getDepartmentLoad, getGovOverview } from "@/lib/gov/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/gov/overview — the operations figures for the signed-in officer.
 *
 * The web renders these in a server component; this is the same three
 * functions behind an authenticated route so the mobile app shows identical
 * numbers rather than deriving its own. Each is already scoped by the
 * officer's own org/dept inside lib/gov/stats.ts — a platform admin widens to
 * everything, a member narrows to their department — so there is no scoping
 * decision left to make here.
 */
export async function GET() {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const [overview, departments, unrouted] = await Promise.all([
    getGovOverview(context.officer),
    getDepartmentLoad(context.officer),
    countUnrouted(context.officer),
  ]);

  return ok({
    overview,
    departments,
    unrouted,
    officer: {
      role: context.officer.role,
      orgName: context.officer.orgName,
      deptName: context.officer.deptName,
    },
  });
}
