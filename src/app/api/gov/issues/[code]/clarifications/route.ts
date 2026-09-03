import { z } from "zod";

import { badRequest, notFound, ok, readJson, unauthorized, unprocessable } from "@/lib/gov/api";
import { getOfficer } from "@/lib/gov/session";
import { canViewIssue, findIssueByCode } from "@/lib/gov/collaboration";
import { listThreadsForIssue, openClarification } from "@/lib/gov/clarification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Which grouped report — and therefore which citizen — is being asked. */
  reportId: z.string().trim().min(1).max(64),
  body: z.string().trim().min(1).max(2000),
});

/** GET — the clarification threads the department has open on this issue. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { code } = await params;
  const issue = await findIssueByCode(decodeURIComponent(code));
  if (!issue || !canViewIssue(context.officer, issue)) return notFound("Issue not found.");

  return ok(await listThreadsForIssue(issue.id));
}

/**
 * POST — asks the citizen behind one of the grouped reports a question.
 *
 * An issue can carry many reports from many citizens, so the officer names the
 * report; the service resolves whose it is. The citizen sees only this
 * exchange, never the department's internal thread.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { code } = await params;
  const issue = await findIssueByCode(decodeURIComponent(code));
  if (!issue || !canViewIssue(context.officer, issue)) return notFound("Issue not found.");

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return unprocessable("Write the question you want to ask.");

  const result = await openClarification({
    issueId: issue.id,
    reportId: parsed.data.reportId,
    officerId: context.officer.id,
    officerName: context.officer.name,
    deptId: issue.deptId,
    body: parsed.data.body,
  });

  if ("error" in result) {
    return badRequest("That report is not part of this issue.", result.error);
  }

  return ok(result, 201);
}
