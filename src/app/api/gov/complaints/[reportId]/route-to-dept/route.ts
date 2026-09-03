import { badRequest, notFound, ok, readJson, unauthorized, unprocessable } from "@/lib/gov/api";
import { canRouteComplaint } from "@/lib/gov/authorize";
import { routeComplaint } from "@/lib/gov/complaints";
import { routeComplaintSchema } from "@/lib/gov/schema";
import { getOfficer } from "@/lib/gov/session";
import { findDepartment } from "@/lib/gov/store";
import { getDictionary } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * POST /api/gov/complaints/[reportId]/route-to-dept
 *
 * The organization head's step: decide which department owns a confirmed
 * complaint. Named `route-to-dept` rather than `route` because `route.ts` is
 * Next.js's own file convention and a `route/` segment beside it reads as a
 * mistake.
 *
 * Routing only decides WHERE. It deliberately does not start the workflow —
 * that happens on assignment, when a named person becomes responsible, so
 * the SLA clock never runs against nobody.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { reportId } = await params;
  const body = await readJson(request);
  if (body === null) return badRequest("We couldn't read that request.");

  const parsed = routeComplaintSchema.safeParse(body);
  if (!parsed.success) return unprocessable("Choose a department to route this to.");

  const dept = await findDepartment(parsed.data.deptId);
  if (!dept) return notFound();

  // Authorize against the department's real parent org, not one supplied by
  // the caller — an org head must not route into another organization.
  if (!canRouteComplaint(context.officer, dept.orgId)) return notFound();

  const result = await routeComplaint({
    reportId,
    orgId: dept.orgId,
    deptId: dept.id,
    officerId: context.officer.id,
    acceptedAiSuggestion: parsed.data.acceptedAiSuggestion ?? false,
  });

  if ("error" in result) {
    return result.error === "not_ready"
      ? notFound()
      : badRequest("This complaint has already been routed.", result.error);
  }

  return ok({ assignmentId: result.assignmentId, message: t.gov.org.routed });
}
