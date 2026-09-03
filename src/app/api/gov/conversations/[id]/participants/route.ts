import { z } from "zod";

import { badRequest, notFound, ok, readJson, unauthorized, unprocessable } from "@/lib/gov/api";
import { getOfficer } from "@/lib/gov/session";
import { canSeePrivateThread } from "@/lib/gov/chat-access";
import {
  addParticipant,
  canViewIssue,
  findConversation,
  listDepartmentOfficers,
  listParticipantIds,
} from "@/lib/gov/collaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ officerId: z.string().trim().min(1).max(64) });

/*
 * POST /api/gov/conversations/[id]/participants
 *
 * Any existing participant can pull a colleague in — no rank required. The
 * person added immediately gains the full history, because the context is why
 * they were added.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { id } = await params;
  const conversation = await findConversation(id);
  if (!conversation || !canViewIssue(context.officer, conversation)) {
    return notFound("Conversation not found.");
  }

  if (conversation.visibility !== "private") {
    return badRequest("This thread is already open to the whole department.", "not_private");
  }

  const participants = await listParticipantIds(id);
  if (!canSeePrivateThread(context.officer.id, participants)) {
    return notFound("Conversation not found.");
  }

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return unprocessable("Choose an officer to add.");

  /*
   * The officer being added must already belong to the issue's department.
   * Otherwise a private thread becomes a way around department isolation:
   * an outsider would gain a view of an issue they cannot otherwise open.
   */
  const roster = conversation.deptId ? await listDepartmentOfficers(conversation.deptId) : [];
  const target = roster.find((o) => o.id === parsed.data.officerId);
  if (!target) return badRequest("That officer is not in this department.", "not_in_department");

  await addParticipant({
    conversationId: id,
    officerId: target.id,
    addedByOfficerId: context.officer.id,
  });

  return ok({ officerId: target.id, name: target.name });
}
