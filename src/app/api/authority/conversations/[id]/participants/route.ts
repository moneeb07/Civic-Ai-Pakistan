import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { db } from "@/db";
import { conversationParticipant } from "@/db/authority/schema";
import {
  actingMembership,
  canAccessConversation,
  getAuthorityViewer,
  loadConversationForAccess,
} from "@/lib/authority/access";
import { listDepartmentMembers, listParticipants } from "@/lib/authority/queries";
import { addParticipantSchema } from "@/lib/authority/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — who is currently in a private discussion, plus who could be added.
 *
 * "Who could be added" is answered from the department roster on the server,
 * so the picker can never offer somebody the POST below would refuse.
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

  const participants = await listParticipants(id);
  const roster = conversation.issueDepartmentId
    ? await listDepartmentMembers(conversation.issueDepartmentId)
    : [];
  const present = new Set(participants.map((p) => p.memberId));

  return NextResponse.json({
    success: true,
    data: {
      visibility: conversation.visibility,
      participants,
      addable: roster
        .filter((member) => !present.has(member.id))
        .map((member) => ({
          id: member.id,
          displayName: member.displayName,
          memberCode: member.memberCode,
        })),
    },
  });
}

/*
 * POST /api/authority/conversations/[id]/participants
 *
 * Adds someone to a private discussion. They immediately gain access to the
 * ENTIRE history — there is no "joined at" cursor anywhere in the read path,
 * because somebody brought into a discussion needs the context that came
 * before them. That is the reason they were added.
 */
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

  // Only an existing participant may bring someone in.
  if (!conversation || !(await canAccessConversation(viewer, conversation))) {
    return NextResponse.json(
      { success: false, message: "Conversation not found." },
      { status: 404 },
    );
  }

  if (conversation.visibility !== "private") {
    return NextResponse.json(
      {
        success: false,
        message: "This discussion is already open to the whole department.",
      },
      { status: 400 },
    );
  }

  const parsed = addParticipantSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Choose a member to add." },
      { status: 400 },
    );
  }

  /*
   * The person being added must already belong to the issue's department.
   * Adding an outsider to a private thread would hand them a view of an issue
   * they have no access to — a private conversation must never become a way
   * around department boundaries.
   */
  const roster = conversation.issueDepartmentId
    ? await listDepartmentMembers(conversation.issueDepartmentId)
    : [];
  const target = roster.find((member) => member.id === parsed.data.memberId);

  if (!target) {
    return NextResponse.json(
      { success: false, message: "That member is not in this department." },
      { status: 400 },
    );
  }

  const existing = await listParticipants(id);
  if (existing.some((participant) => participant.memberId === target.id)) {
    return NextResponse.json({ success: true, data: { alreadyPresent: true } });
  }

  const acting = actingMembership(viewer, {
    authorityId: conversation.issueAuthorityId,
    departmentId: conversation.issueDepartmentId,
  });

  await db.insert(conversationParticipant).values({
    id: randomBytes(16).toString("base64url"),
    conversationId: id,
    memberId: target.id,
    addedByMemberId: acting?.memberId ?? null,
  });

  return NextResponse.json({
    success: true,
    data: { memberId: target.id, displayName: target.displayName },
  });
}
