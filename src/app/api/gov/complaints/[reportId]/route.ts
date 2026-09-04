import { notFound, ok, unauthorized } from "@/lib/gov/api";
import { getComplaintForOfficer, listStageProgress } from "@/lib/gov/complaints";
import { listComplaintEvents } from "@/lib/gov/events";
import { getOfficer } from "@/lib/gov/session";
import {
  canAdvanceStage,
  canAssignComplaint,
  canReopenComplaint,
  canRouteComplaint,
} from "@/lib/gov/authorize";
import { getStageById } from "@/lib/gov/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/gov/complaints/[reportId] — one complaint with its stage history
 * and audit timeline, or 404.
 *
 * getComplaintForOfficer() returns null both for a complaint that does not
 * exist and for one outside the caller's scope, and this turns both into the
 * same 404 — an officer must not be able to probe for complaint ids belonging
 * to another department.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { reportId } = await params;
  const complaint = await getComplaintForOfficer(reportId, context.officer);
  if (!complaint) return notFound();

  const [progress, events, stage] = await Promise.all([
    complaint.assignment ? listStageProgress(complaint.assignment.id) : Promise.resolve([]),
    listComplaintEvents(reportId),
    complaint.assignment?.currentStageId
      ? getStageById(complaint.assignment.currentStageId)
      : Promise.resolve(null),
  ]);

  /*
   * What this officer may actually do, and what the current stage demands —
   * decided here rather than inferred by the client.
   *
   * The web reads both server-side in its page component; a native client
   * cannot, and without them it would either hide controls an officer is
   * entitled to or offer ones the server will reject. The same authorize.ts
   * predicates the mutating routes enforce are the ones answered here, so the
   * button a client shows and the permission the server checks cannot drift.
   */
  const scope = complaint.assignment
    ? {
        orgId: complaint.assignment.orgId,
        deptId: complaint.assignment.deptId,
        assignedOfficerId: complaint.assignment.assignedOfficerId,
      }
    : null;

  const permissions = {
    canAdvance: scope ? canAdvanceStage(context.officer, scope) : false,
    canReopen: scope ? canReopenComplaint(context.officer, scope) : false,
    /*
     * Assigning is a department head's act on work already routed to their
     * department; routing is an org head's act on work that has none yet. A
     * complaint is therefore never in both states at once, and the client can
     * render whichever control it is handed without deciding anything.
     */
    canAssign: scope ? canAssignComplaint(context.officer, scope) : false,
    canRoute:
      complaint.assignment === null && context.officer.orgId
        ? canRouteComplaint(context.officer, context.officer.orgId)
        : false,
    requiresPhoto: stage?.requiresPhoto ?? false,
    requiresNote: stage?.requiresNote ?? false,
  };

  return ok({ complaint, progress, events, permissions });
}
