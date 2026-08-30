import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { db } from "@/db";
import { issueMessage, messageMention } from "@/db/authority/schema";
import {
  actingMembership,
  canAccessConversation,
  getAuthorityViewer,
  loadConversationForAccess,
} from "@/lib/authority/access";
import { resolveMentions } from "@/lib/authority/mentions";
import { listDepartmentMembers, listMessages } from "@/lib/authority/queries";
import { postMessageSchema } from "@/lib/authority/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET/POST /api/authority/conversations/[id]/messages
 *
 * Both verbs run the same access check first. A private conversation is
 * invisible to a non-participant even for reading, and being an authority
 * admin is not a way in — otherwise "private" would only mean "private from
 * your colleagues".
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getAuthorityViewer();
  if (!viewer) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  const { id } = await params;
  const conversation = await loadConversationForAccess(id);
  if (!conversation || !(await canAccessConversation(viewer, conversation))) {
    return NextResponse.json(
      { success: false, message: "Conversation not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: await listMessages(id) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getAuthorityViewer();
  if (!viewer) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  const { id } = await params;
  const conversation = await loadConversationForAccess(id);
  if (!conversation || !(await canAccessConversation(viewer, conversation))) {
    return NextResponse.json(
      { success: false, message: "Conversation not found." },
      { status: 404 },
    );
  }

  const parsed = postMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Write a message first." },
      { status: 400 },
    );
  }

  const acting = actingMembership(viewer, {
    authorityId: conversation.issueAuthorityId,
    departmentId: conversation.issueDepartmentId,
  });
  if (!acting) {
    return NextResponse.json({ success: false, message: "Not authorised." }, { status: 403 });
  }

  /*
   * Mentions are resolved server-side against the department roster, never
   * taken from the client. A mention the client asked for but that does not
   * resolve to a real member of this department is simply not stored — it
   * stays plain text in the body.
   */
  const roster = conversation.issueDepartmentId
    ? await listDepartmentMembers(conversation.issueDepartmentId)
    : [];
  const mentions = resolveMentions(
    parsed.data.body,
    roster.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      memberCode: member.memberCode,
    })),
  );

  const messageId = randomBytes(16).toString("base64url");

  await db.insert(issueMessage).values({
    id: messageId,
    conversationId: id,
    memberId: acting.memberId,
    body: parsed.data.body,
  });

  for (const mention of mentions) {
    await db.insert(messageMention).values({
      id: randomBytes(16).toString("base64url"),
      messageId,
      memberId: mention.memberId,
    });
  }

  return NextResponse.json({
    success: true,
    data: { id: messageId, mentions: mentions.map((m) => m.displayName) },
  });
}
