import { badRequest, notFound, ok, readJson, unauthorized, unprocessable } from "@/lib/gov/api";
import { canManageAssignees, canViewComplaint } from "@/lib/gov/authorize";
import { addAssignee, listAssignees } from "@/lib/gov/assignees";
import { getAssignmentScope } from "@/lib/gov/complaints";
import { assignComplaintSchema } from "@/lib/gov/schema";
import { getOfficer } from "@/lib/gov/session";
import { findOfficerInDepartment } from "@/lib/gov/store";
import { getDictionary } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * GET  /api/gov/complaints/[reportId]/assignees — who is working on it.
 * POST /api/gov/complaints/[reportId]/assignees — put one more person on it.
 *
 * A collection rather than a single `assign` action, because a complaint can
 * have several people on it: the department head assigns the first, which
 * starts the workflow, and adds others as the problem turns out to need them.
 *
 * The assignee is looked up scoped to the complaint's own department in the
 * same query, so a department head cannot put someone from another department
 * on their complaint even by supplying a valid officer id.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { reportId } = await params;
  const scope = await getAssignmentScope(reportId);
  if (!scope) return notFound();

  if (!canViewComplaint(context.officer, scope)) return notFound();

  return ok(await listAssignees(scope.id));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { reportId } = await params;
  const scope = await getAssignmentScope(reportId);
  if (!scope) return notFound();
  if (!canManageAssignees(context.officer, scope)) return notFound();

  const body = await readJson(request);
  if (body === null) return badRequest("We couldn't read that request.");

  const parsed = assignComplaintSchema.safeParse(body);
  if (!parsed.success) return unprocessable(t.gov.dept.chooseAssignee);

  const assignee = await findOfficerInDepartment(parsed.data.officerId, scope.deptId);
  if (!assignee) return notFound();

  const result = await addAssignee({
    reportId,
    assignmentId: scope.id,
    deptId: scope.deptId,
    officerId: assignee.id,
    byOfficerId: context.officer.id,
  });

  if ("error" in result) {
    return badRequest(
      result.error === "no_workflow" ? t.gov.dept.needsWorkflow : t.gov.dept.alreadyAssigned,
      result.error,
    );
  }

  return ok({
    startedWorkflow: result.startedWorkflow,
    assignees: await listAssignees(scope.id),
    message: t.gov.dept.assigned,
  });
}
