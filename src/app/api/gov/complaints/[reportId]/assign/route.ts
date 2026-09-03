import { badRequest, notFound, ok, readJson, unauthorized, unprocessable } from "@/lib/gov/api";
import { canAssignComplaint } from "@/lib/gov/authorize";
import { assignComplaint, getAssignmentScope } from "@/lib/gov/complaints";
import { assignComplaintSchema } from "@/lib/gov/schema";
import { getOfficer } from "@/lib/gov/session";
import { findOfficerInDepartment } from "@/lib/gov/store";
import { getDictionary } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * POST /api/gov/complaints/[reportId]/assign
 *
 * The department head's step: hand a routed complaint to a named person. This
 * is what puts the complaint into the workflow at stage 0 and starts the
 * clock.
 *
 * The assignee is looked up scoped to the department in the same query, so a
 * dept head cannot assign work to someone outside their own team even by
 * supplying a valid officer id.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { reportId } = await params;
  const scope = await getAssignmentScope(reportId);
  if (!scope) return notFound();
  if (!canAssignComplaint(context.officer, scope)) return notFound();

  const body = await readJson(request);
  if (body === null) return badRequest("We couldn't read that request.");

  const parsed = assignComplaintSchema.safeParse(body);
  if (!parsed.success) return unprocessable("Choose who should handle this.");

  const assignee = await findOfficerInDepartment(parsed.data.officerId, scope.deptId);
  if (!assignee) return notFound();

  const result = await assignComplaint({
    reportId,
    assignmentId: scope.id,
    deptId: scope.deptId,
    toOfficerId: assignee.id,
    byOfficerId: context.officer.id,
  });

  if ("error" in result) {
    // A department with no saved workflow has no stage 0 to place this in.
    // Refused rather than invented — see saveWorkflow's note on templates.
    return badRequest(t.gov.dept.needsWorkflow, result.error);
  }

  return ok({ stageId: result.stageId, message: t.gov.dept.assigned });
}
