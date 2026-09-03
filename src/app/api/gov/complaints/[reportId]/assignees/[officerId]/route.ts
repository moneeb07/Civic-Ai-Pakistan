import { badRequest, notFound, ok, unauthorized } from "@/lib/gov/api";
import { canManageAssignees } from "@/lib/gov/authorize";
import { listAssignees, removeAssignee } from "@/lib/gov/assignees";
import { getAssignmentScope } from "@/lib/gov/complaints";
import { getOfficer } from "@/lib/gov/session";
import { getDictionary } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * DELETE /api/gov/complaints/[reportId]/assignees/[officerId]
 *
 * Takes one person off a complaint. Refuses to remove the last one: a
 * complaint mid-workflow with nobody on it is invisible work — still counting
 * against its SLA, still sitting at a stage, but gone from every member's
 * queue. Add a replacement first.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ reportId: string; officerId: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { reportId, officerId } = await params;
  const scope = await getAssignmentScope(reportId);
  if (!scope) return notFound();
  if (!canManageAssignees(context.officer, scope)) return notFound();

  const result = await removeAssignee({
    reportId,
    assignmentId: scope.id,
    officerId,
    byOfficerId: context.officer.id,
  });

  if ("error" in result) {
    if (result.error === "not_assigned") return notFound();
    return badRequest(t.gov.dept.cannotRemoveLastAssignee, result.error);
  }

  return ok({ assignees: await listAssignees(scope.id), message: t.gov.dept.assigneeRemoved });
}
