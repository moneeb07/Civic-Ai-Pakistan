import { badRequest, notFound, ok, readJson, unauthorized, unprocessable } from "@/lib/gov/api";
import { canAdvanceStage } from "@/lib/gov/authorize";
import { advanceStage, getAssignmentScope } from "@/lib/gov/complaints";
import { advanceStageSchema } from "@/lib/gov/schema";
import { getOfficer } from "@/lib/gov/session";
import { getDictionary } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * POST /api/gov/complaints/[reportId]/advance
 *
 * Moves a complaint one stage forward. The stage's own requiresPhoto /
 * requiresNote flags are enforced in advanceStage() before anything is
 * written — the UI disables the button too, but a disabled button is a
 * convenience, not a control.
 *
 * Reaching the terminal stage resolves the complaint and writes the citizen's
 * notification in the same transaction, so a resolved complaint with no
 * notification is not a state this code can produce.
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
  if (!canAdvanceStage(context.officer, scope)) return notFound();

  const body = await readJson(request);
  if (body === null) return badRequest("We couldn't read that request.");

  const parsed = advanceStageSchema.safeParse(body);
  if (!parsed.success) return unprocessable("Please check the highlighted fields.");

  const result = await advanceStage({
    reportId,
    assignmentId: scope.id,
    officerId: context.officer.id,
    photoUrl: parsed.data.photoUrl ?? null,
    note: parsed.data.note ?? null,
  });

  if ("error" in result) {
    if (result.error === "requirements_unmet") {
      // 422 with the exact list, so the form can mark the missing field
      // rather than showing one generic banner.
      return unprocessable(t.gov.complaint.requirementsUnmet, "requirements_unmet");
    }
    if (result.error === "already_resolved") {
      return badRequest(t.gov.complaint.resolvedNotice, result.error);
    }
    if (result.error === "not_started") {
      return badRequest(t.gov.complaint.notStarted, result.error);
    }
    return badRequest(t.gov.common.unexpectedError, result.error);
  }

  return ok({
    resolved: result.resolved,
    nextStageId: result.nextStageId,
    message: result.resolved ? t.gov.complaint.resolvedNotice : t.gov.complaint.advanced,
  });
}
