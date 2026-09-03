import { z } from "zod";

import { badRequest, notFound, ok, readJson, unauthorized, unprocessable } from "@/lib/gov/api";
import { getOfficer } from "@/lib/gov/session";
import {
  canViewIssue,
  createConversation,
  findIssueByCode,
  listConversations,
} from "@/lib/gov/collaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(2).max(80),
  visibility: z.enum(["department", "private"]),
  participantOfficerIds: z.array(z.string().max(64)).max(50).optional(),
});

/** GET — threads on this issue that the caller may see. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { code } = await params;
  const issue = await findIssueByCode(decodeURIComponent(code));
  // 404 rather than 403: whether an issue exists is itself information.
  if (!issue || !canViewIssue(context.officer, issue)) return notFound("Issue not found.");

  return ok(await listConversations(issue.id, context.officer.id));
}

/**
 * POST — opens a thread.
 *
 * Any officer who can see the issue can open one; there is no rank check,
 * which is the entire point of the feature.
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
  if (!parsed.success) return unprocessable("Please check the discussion details.");

  if (!issue.deptId && parsed.data.visibility === "private") {
    return badRequest(
      "This issue has no department yet, so there is no roster to invite from.",
      "unrouted",
    );
  }

  const id = await createConversation({
    issueId: issue.id,
    title: parsed.data.title,
    visibility: parsed.data.visibility,
    createdByOfficerId: context.officer.id,
    participantOfficerIds: parsed.data.participantOfficerIds,
    deptId: issue.deptId,
  });

  return ok({ id }, 201);
}
