import { z } from "zod";

import { notFound, ok, readJson, unauthorized, unprocessable } from "@/lib/gov/api";
import { getOfficer } from "@/lib/gov/session";
import { canViewIssue } from "@/lib/gov/collaboration";
import {
  findThread,
  listClarificationMessages,
  markThreadRead,
  officerReply,
} from "@/lib/gov/clarification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

/**
 * Access to a clarification thread rides on access to its issue.
 *
 * A thread is a department's conversation with a citizen, so the department
 * that may open the issue may read and answer it — no separate participant
 * list, unlike the internal private threads. A thread outside the officer's
 * scope reads as absent rather than forbidden, so this endpoint cannot be used
 * to confirm that a given issue exists elsewhere.
 */
async function guard(threadId: string) {
  const context = await getOfficer();
  if (!context) return { response: unauthorized() } as const;

  const thread = await findThread(threadId);
  if (!thread) return { response: notFound("Conversation not found.") } as const;

  const visible = canViewIssue(context.officer, {
    id: thread.issueId,
    issueCode: thread.issueCode,
    orgId: thread.orgId,
    deptId: thread.issueDeptId,
  });
  if (!visible) return { response: notFound("Conversation not found.") } as const;

  return { officer: context.officer, thread } as const;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const guarded = await guard(threadId);
  if ("response" in guarded) return guarded.response;

  const messages = await listClarificationMessages(threadId);
  // Opening the thread is what "seen" means, so the citizen's badge clears.
  await markThreadRead(threadId, "officer");

  return ok(
    messages.map((message) => ({
      ...message,
      // The officer sees who actually wrote it; only the citizen's view
      // collapses staff into "Department".
      authorName: message.senderKind === "citizen" ? "Citizen" : message.authorName,
    })),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const guarded = await guard(threadId);
  if ("response" in guarded) return guarded.response;

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return unprocessable("Write a message to send.");

  await officerReply({
    threadId,
    officerId: guarded.officer.id,
    body: parsed.data.body,
  });

  return ok({ sent: true }, 201);
}
