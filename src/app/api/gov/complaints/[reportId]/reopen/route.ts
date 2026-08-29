import { badRequest, notFound, ok, unauthorized } from "@/lib/gov/api";
import { canReopenComplaint } from "@/lib/gov/authorize";
import { getAssignmentScope, reopenComplaint } from "@/lib/gov/complaints";
import { getOfficer } from "@/lib/gov/session";
import { getDictionary } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * POST /api/gov/complaints/[reportId]/reopen
 *
 * A low rating flags a complaint for attention; it never reopens one. This
 * endpoint is the only way back into the workflow, and only the department
 * head accountable for that queue can call it — reopening is a management
 * decision, not an automatic consequence of an unhappy citizen.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { reportId } = await params;
  const scope = await getAssignmentScope(reportId);
  if (!scope) return notFound();
  if (!canReopenComplaint(context.officer, scope)) return notFound();

  const result = await reopenComplaint({
    reportId,
    assignmentId: scope.id,
    deptId: scope.deptId,
    officerId: context.officer.id,
  });

  if ("error" in result) {
    return badRequest(
      result.error === "not_resolved"
        ? "Only a resolved complaint can be reopened."
        : t.gov.dept.needsWorkflow,
      result.error,
    );
  }

  return ok({ message: t.gov.dept.reopened });
}
