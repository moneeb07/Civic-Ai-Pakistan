import { z } from "zod";

import { notFound, ok, readJson, unauthorized, unprocessable } from "@/lib/gov/api";
import { getOfficer } from "@/lib/gov/session";
import { canSeePrivateThread } from "@/lib/gov/chat-access";
import {
  canViewIssue,
  findConversation,
  listMessages,
  listParticipantIds,
  postMessage,
} from "@/lib/gov/collaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

/**
 * Both verbs run the same gate: the caller must be able to see the issue, and
 * for a private thread must be a participant. Seniority is not a way in.
 */
async function guard(conversationId: string) {
  const context = await getOfficer();
  if (!context) return { error: unauthorized() } as const;

  const conversation = await findConversation(conversationId);
  if (!conversation) return { error: notFound("Conversation not found.") } as const;

  if (!canViewIssue(context.officer, conversation)) {
    return { error: notFound("Conversation not found.") } as const;
  }

  if (conversation.visibility === "private") {
    const participants = await listParticipantIds(conversationId);
    if (!canSeePrivateThread(context.officer.id, participants)) {
      return { error: notFound("Conversation not found.") } as const;
    }
  }

  return { context, conversation } as const;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guarded = await guard(id);
  if ("error" in guarded) return guarded.error;

  return ok(await listMessages(id));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guarded = await guard(id);
  if ("error" in guarded) return guarded.error;

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return unprocessable("Write a message first.");

  const result = await postMessage({
    conversationId: id,
    officerId: guarded.context.officer.id,
    officerName: guarded.context.officer.name,
    body: parsed.data.body,
    deptId: guarded.conversation.deptId,
    issueId: guarded.conversation.issueId,
    issueCode: guarded.conversation.issueCode,
  });

  return ok(result, 201);
}
