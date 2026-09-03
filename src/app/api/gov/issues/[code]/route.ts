import { notFound, ok, unauthorized } from "@/lib/gov/api";
import { getOfficer } from "@/lib/gov/session";
import {
  canViewIssue,
  findIssueByCode,
  getIssueDetail,
  listConversations,
  listIssueReports,
} from "@/lib/gov/collaboration";
import { listThreadsForIssue } from "@/lib/gov/clarification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — everything the issue screen shows, in one round trip.
 *
 * Bundled deliberately: on a phone over a patchy connection, four sequential
 * requests to paint one screen is four chances to half-load it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { code } = await params;
  const scope = await findIssueByCode(decodeURIComponent(code));
  if (!scope || !canViewIssue(context.officer, scope)) return notFound("Issue not found.");

  const [issue, reports, conversations, clarifications] = await Promise.all([
    getIssueDetail(scope.id),
    listIssueReports(scope.id),
    listConversations(scope.id, context.officer.id),
    listThreadsForIssue(scope.id),
  ]);

  if (!issue) return notFound("Issue not found.");

  return ok({ issue, reports, conversations, clarifications });
}
