import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/session";
import {
  citizenReply,
  findThread,
  listClarificationMessages,
  markThreadRead,
} from "@/lib/gov/clarification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

const unauthenticated = () =>
  NextResponse.json(
    { success: false, message: "Please sign in.", reason: "unauthenticated" },
    { status: 401 },
  );

/*
 * The citizen's own view of one clarification thread.
 *
 * Ownership is checked against the session's user id: reading somebody else's
 * thread is indistinguishable from reading one that does not exist.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await getSession();
  if (!session) return unauthenticated();

  const { threadId } = await params;
  const thread = await findThread(threadId);
  if (!thread || thread.citizenUserId !== session.user.id) {
    return NextResponse.json(
      { success: false, message: "Not found.", reason: "not_found" },
      { status: 404 },
    );
  }

  const messages = await listClarificationMessages(threadId);
  // Opening the thread is what marks the department's questions as seen.
  await markThreadRead(threadId, "citizen");

  return NextResponse.json({
    success: true,
    data: { issueCode: thread.issueCode, status: thread.status, messages },
  });
}

/** The citizen's answer, which puts the thread back in the officer's inbox. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await getSession();
  if (!session) return unauthenticated();

  const { threadId } = await params;

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Write a reply first.", reason: "validation_failed" },
      { status: 422 },
    );
  }

  const result = await citizenReply({
    threadId,
    citizenUserId: session.user.id,
    citizenName: session.user.name,
    body: parsed.data.body,
  });

  if ("error" in result) {
    return NextResponse.json(
      { success: false, message: "Not found.", reason: "not_found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: { sent: true } }, { status: 201 });
}
