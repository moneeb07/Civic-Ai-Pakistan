import { notFound, ok, unauthorized } from "@/lib/gov/api";
import { getComplaintForOfficer, listStageProgress } from "@/lib/gov/complaints";
import { listComplaintEvents } from "@/lib/gov/events";
import { getOfficer } from "@/lib/gov/session";

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

  const [progress, events] = await Promise.all([
    complaint.assignment ? listStageProgress(complaint.assignment.id) : Promise.resolve([]),
    listComplaintEvents(reportId),
  ]);

  return ok({ complaint, progress, events });
}
