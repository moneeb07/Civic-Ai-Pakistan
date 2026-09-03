import { badRequest, notFound, ok, readJson, unauthorized, unprocessable } from "@/lib/gov/api";
import { canPostToChat, canReadChat } from "@/lib/gov/authorize";
import {
  chatParticipants,
  listChatMessages,
  listChatMessagesSince,
  postChatMessage,
} from "@/lib/gov/chat";
import { getAssignmentScope } from "@/lib/gov/complaints";
import { chatMessageSchema } from "@/lib/gov/schema";
import { getOfficer } from "@/lib/gov/session";
import { getDictionary } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * The per-complaint group chat.
 *
 * GET  ?since=<iso>  — the transcript, or only what has arrived since that
 *                      instant. The panel polls with `since` so a long
 *                      conversation does not get more expensive to keep open.
 * POST               — append one message.
 *
 * Reading is gated by canReadChat (the same rule as viewing the complaint, so
 * the chat is never a looser second path to the same case) and posting by
 * canPostToChat (participants only). A platform admin can therefore read a
 * conversation for oversight without being in it.
 *
 * An unrouted complaint has no chat: there is no department and no assignee
 * yet, so there is no group — the response says so rather than showing an
 * empty room nobody can speak in.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { reportId } = await params;
  const scope = await getAssignmentScope(reportId);
  if (!scope) return notFound();
  if (!canReadChat(context.officer, scope)) return notFound();

  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  const incremental = since !== null && !Number.isNaN(since.getTime());

  const [messages, participants] = await Promise.all([
    incremental ? listChatMessagesSince(reportId, since) : listChatMessages(reportId),
    chatParticipants(scope.orgId, scope.deptId, scope.assigneeIds),
  ]);

  return ok({
    messages,
    participants,
    incremental,
    canPost: canPostToChat(context.officer, scope),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { reportId } = await params;
  const scope = await getAssignmentScope(reportId);
  if (!scope) return notFound();

  // Read access is not permission to speak: an admin observing a department's
  // conversation must not be able to join it.
  if (!canReadChat(context.officer, scope)) return notFound();
  if (!canPostToChat(context.officer, scope)) {
    return badRequest(t.gov.chat.cannotPost, "not_a_participant");
  }

  const body = await readJson(request);
  if (body === null) return badRequest("We couldn't read that request.");

  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) return unprocessable(t.gov.chat.emptyMessage);

  const message = await postChatMessage({
    reportId,
    authorOfficerId: context.officer.id,
    body: parsed.data.body,
  });

  return ok(message, 201);
}
