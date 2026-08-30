import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { db } from "@/db";
import { conversationParticipant, issueConversation } from "@/db/authority/schema";
import {
  actingMembership,
  canAccessIssue,
  getAuthorityViewer,
} from "@/lib/authority/access";
import { getIssueByCode, listDepartmentMembers } from "@/lib/authority/queries";
import { createConversationSchema } from "@/lib/authority/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST /api/authority/issues/[code]/conversations
 *
 * Opens a discussion on an issue. Any member with access may open one — there
 * is no rank required to start a conversation, which is the whole point of not
 * having ranks.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const viewer = await getAuthorityViewer();
  if (!viewer) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  const { code } = await params;
  const issue = await getIssueByCode(code);
  if (!issue || !canAccessIssue(viewer, issue)) {
    return NextResponse.json({ success: false, message: "Issue not found." }, { status: 404 });
  }

  const parsed = createConversationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Please check the discussion details.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const acting = actingMembership(viewer, issue);
  if (!acting) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  const conversationId = randomBytes(16).toString("base64url");

  await db.insert(issueConversation).values({
    id: conversationId,
    issueId: issue.id,
    title: parsed.data.title,
    visibility: parsed.data.visibility,
    createdByMemberId: acting.memberId,
  });

  if (parsed.data.visibility === "private") {
    /*
     * Participants are filtered against the department roster rather than
     * trusted from the request. Without this, a caller could add a member of
     * another department to a private thread and hand them access to an issue
     * they cannot otherwise open.
     */
    const roster = issue.departmentId
      ? await listDepartmentMembers(issue.departmentId)
      : [];
    const allowed = new Set(roster.map((member) => member.id));

    const participants = new Set<string>([acting.memberId]);
    for (const id of parsed.data.participantMemberIds ?? []) {
      if (allowed.has(id)) participants.add(id);
    }

    for (const memberId of participants) {
      await db.insert(conversationParticipant).values({
        id: randomBytes(16).toString("base64url"),
        conversationId,
        memberId,
        addedByMemberId: acting.memberId,
      });
    }
  }

  return NextResponse.json({ success: true, data: { id: conversationId } });
}
