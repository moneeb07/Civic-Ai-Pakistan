import "server-only";

import { and, asc, eq, gt, inArray, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { newId } from "./ids";
import type {
  ChatMessageDto,
  ChatParticipantDto,
  OfficerRole,
} from "./schema";

/*
 * The per-complaint group chat.
 *
 * One thread per complaint, for its lifetime. The people in the room are
 * DERIVED from who is currently responsible rather than stored in a
 * membership table:
 *
 *   - the head of the organization the complaint was routed within
 *   - the head of the department it was routed to
 *   - everyone currently assigned to it
 *
 * Deriving matters. A stored participant list would have to be updated on
 * every route, every assign, every unassign and every personnel change, and
 * the first missed update would leave someone either unable to reach a
 * conversation about their own work or able to read one they had left. The
 * query below cannot drift, because it asks the same question the
 * authorization rules ask.
 */

/**
 * Everyone in the room for one complaint, with the reason they are there.
 *
 * `assigneeIds` is passed in rather than re-queried because every caller has
 * already loaded it to authorize the request.
 */
export async function chatParticipants(
  orgId: string,
  deptId: string,
  assigneeIds: string[],
): Promise<ChatParticipantDto[]> {
  /*
   * The three reasons someone is in the room, as one WHERE clause.
   *
   * Selecting every officer and filtering in TypeScript would work and would
   * be wrong for the same reason it is wrong everywhere else in this
   * directory: the scope belongs in the query, so no code path can forget it.
   */
  const conditions: SQL[] = [
    and(eq(govSchema.officer.role, "org_head"), eq(govSchema.officer.orgId, orgId))!,
    and(eq(govSchema.officer.role, "dept_head"), eq(govSchema.officer.deptId, deptId))!,
  ];
  if (assigneeIds.length > 0) {
    conditions.push(inArray(govSchema.officer.id, assigneeIds));
  }

  const rows = await db
    .select({
      officerId: govSchema.officer.id,
      name: schema.user.name,
      role: govSchema.officer.role,
      orgId: govSchema.officer.orgId,
      deptId: govSchema.officer.deptId,
    })
    .from(govSchema.officer)
    .innerJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(or(...conditions));

  const participants: ChatParticipantDto[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    let reason: ChatParticipantDto["reason"] | null = null;

    if (row.role === "org_head" && row.orgId === orgId) reason = "organization_head";
    else if (row.role === "dept_head" && row.deptId === deptId) reason = "department_head";
    else if (assigneeIds.includes(row.officerId)) reason = "assignee";

    // A department head who is also assigned appears once, as the head.
    if (reason && !seen.has(row.officerId)) {
      seen.add(row.officerId);
      participants.push({
        officerId: row.officerId,
        name: row.name,
        role: row.role as OfficerRole,
        reason,
      });
    }
  }

  // Organization head first, then department head, then the people doing the work.
  const order: Record<ChatParticipantDto["reason"], number> = {
    organization_head: 0,
    department_head: 1,
    assignee: 2,
  };
  return participants.sort(
    (a, b) => order[a.reason] - order[b.reason] || a.name.localeCompare(b.name),
  );
}

/**
 * The transcript, oldest first — the order a conversation is read in.
 *
 * Takes no scope argument: the caller has already proved it may read this
 * complaint (canReadChat over a dept-scoped assignment lookup) before getting
 * here. Callers must not reach this with an unchecked report id.
 */
export async function listChatMessages(reportId: string): Promise<ChatMessageDto[]> {
  const rows = await db
    .select({
      id: govSchema.complaintChatMessage.id,
      authorOfficerId: govSchema.complaintChatMessage.authorOfficerId,
      body: govSchema.complaintChatMessage.body,
      createdAt: govSchema.complaintChatMessage.createdAt,
      authorName: schema.user.name,
      authorRole: govSchema.officer.role,
    })
    .from(govSchema.complaintChatMessage)
    .leftJoin(
      govSchema.officer,
      eq(govSchema.officer.id, govSchema.complaintChatMessage.authorOfficerId),
    )
    .leftJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(eq(govSchema.complaintChatMessage.reportId, reportId))
    .orderBy(asc(govSchema.complaintChatMessage.createdAt));

  return rows.map((row) => ({
    id: row.id,
    authorOfficerId: row.authorOfficerId,
    // The officer record is gone but the message stays — the transcript is a
    // record of how a public complaint was handled, not a personnel file.
    authorName: row.authorName ?? "Former member",
    authorRole: (row.authorRole as OfficerRole | null) ?? null,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Appends one message. The caller has already proved the author may post. */
export async function postChatMessage(input: {
  reportId: string;
  authorOfficerId: string;
  body: string;
}): Promise<ChatMessageDto> {
  const id = newId();
  const createdAt = new Date();

  await db.insert(govSchema.complaintChatMessage).values({
    id,
    reportId: input.reportId,
    authorOfficerId: input.authorOfficerId,
    body: input.body,
    createdAt,
  });

  const [author] = await db
    .select({ name: schema.user.name, role: govSchema.officer.role })
    .from(govSchema.officer)
    .innerJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(eq(govSchema.officer.id, input.authorOfficerId))
    .limit(1);

  return {
    id,
    authorOfficerId: input.authorOfficerId,
    authorName: author?.name ?? "Former member",
    authorRole: (author?.role as OfficerRole | null) ?? null,
    body: input.body,
    createdAt: createdAt.toISOString(),
  };
}

/**
 * Message counts for a list of complaints, in one query.
 *
 * The queue pages render a chat badge per card; fetching a count per card
 * would be one round trip per complaint. Returns a map so a missing key
 * simply means zero.
 */
export async function chatMessageCounts(reportIds: string[]): Promise<Map<string, number>> {
  if (reportIds.length === 0) return new Map();

  const rows = await db
    .select({ reportId: govSchema.complaintChatMessage.reportId })
    .from(govSchema.complaintChatMessage)
    .where(inArray(govSchema.complaintChatMessage.reportId, reportIds));

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.reportId, (counts.get(row.reportId) ?? 0) + 1);
  }
  return counts;
}

/** Whether a complaint has any messages yet — for a single detail page. */
export async function hasChatMessages(reportId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: govSchema.complaintChatMessage.id })
    .from(govSchema.complaintChatMessage)
    .where(eq(govSchema.complaintChatMessage.reportId, reportId))
    .limit(1);

  return Boolean(row);
}

/**
 * Messages posted after a given instant, for the chat panel's poll.
 *
 * The panel asks for what it has not seen rather than re-fetching the whole
 * transcript every few seconds, so a long conversation does not get more
 * expensive to keep open.
 */
export async function listChatMessagesSince(
  reportId: string,
  since: Date,
): Promise<ChatMessageDto[]> {
  const rows = await db
    .select({
      id: govSchema.complaintChatMessage.id,
      authorOfficerId: govSchema.complaintChatMessage.authorOfficerId,
      body: govSchema.complaintChatMessage.body,
      createdAt: govSchema.complaintChatMessage.createdAt,
      authorName: schema.user.name,
      authorRole: govSchema.officer.role,
    })
    .from(govSchema.complaintChatMessage)
    .leftJoin(
      govSchema.officer,
      eq(govSchema.officer.id, govSchema.complaintChatMessage.authorOfficerId),
    )
    .leftJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(
      and(
        eq(govSchema.complaintChatMessage.reportId, reportId),
        gt(govSchema.complaintChatMessage.createdAt, since),
      ),
    )
    .orderBy(asc(govSchema.complaintChatMessage.createdAt));

  return rows.map((row) => ({
    id: row.id,
    authorOfficerId: row.authorOfficerId,
    authorName: row.authorName ?? "Former member",
    authorRole: (row.authorRole as OfficerRole | null) ?? null,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }));
}
