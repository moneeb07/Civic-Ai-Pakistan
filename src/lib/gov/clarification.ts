import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { collabSchema } from "@/db/gov/collaboration";
import { newId } from "./ids";

/*
 * The officer ↔ citizen clarification channel.
 *
 * A department working an issue often needs one detail only the person who
 * reported it can supply — which side of the street, is it still there, how
 * deep. Without a way to ask, the officer either guesses or closes the case
 * for want of a sentence.
 *
 * Two design decisions carry the whole feature:
 *
 * 1. It is keyed to a SPECIFIC REPORT, not to the issue. An issue groups many
 *    reports from many citizens, so "ask the reporter" is meaningless until
 *    you say which one. The officer picks a report from the grouped list and
 *    asks that person.
 *
 * 2. It is a separate table from `issue_conversation`, not a flag on it. The
 *    citizen must never see the department's internal discussion, and keeping
 *    the two in different tables makes that structural rather than a WHERE
 *    clause somebody has to remember to write.
 *
 * The citizen sees only their own thread; the department sees every thread on
 * the issue it owns.
 */

const { clarificationThread, clarificationMessage, civicIssue, issueReport, officerNotification } =
  collabSchema;

export interface ClarificationThreadDto {
  id: string;
  issueId: string;
  issueCode: string;
  reportId: string;
  citizenUserId: string;
  citizenName: string | null;
  status: "open" | "closed";
  messageCount: number;
  lastMessageAt: Date | null;
  unreadForOfficer: number;
  unreadForCitizen: number;
}

export interface ClarificationMessageDto {
  id: string;
  senderKind: "officer" | "citizen";
  authorName: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Opens a clarification thread, or returns the existing one for that report.
 *
 * One thread per report by design (enforced by a unique index too): a second
 * parallel thread with the same citizen about the same report would split the
 * conversation and leave both halves looking unanswered.
 */
export async function openClarification(input: {
  issueId: string;
  reportId: string;
  officerId: string;
  officerName: string;
  deptId: string | null;
  body: string;
}): Promise<{ threadId: string; created: boolean } | { error: "report_not_in_issue" }> {
  /*
   * The report must actually belong to this issue. Without this check an
   * officer could name any report id and open a channel to a citizen whose
   * complaint their department has nothing to do with.
   */
  const [link] = await db
    .select({ reportId: issueReport.reportId, citizenUserId: schema.report.userId })
    .from(issueReport)
    .innerJoin(schema.report, eq(schema.report.id, issueReport.reportId))
    .where(and(eq(issueReport.issueId, input.issueId), eq(issueReport.reportId, input.reportId)))
    .limit(1);

  if (!link) return { error: "report_not_in_issue" };

  const [existing] = await db
    .select({ id: clarificationThread.id })
    .from(clarificationThread)
    .where(eq(clarificationThread.reportId, input.reportId))
    .limit(1);

  const threadId = existing?.id ?? newId();

  if (!existing) {
    await db.insert(clarificationThread).values({
      id: threadId,
      issueId: input.issueId,
      reportId: input.reportId,
      citizenUserId: link.citizenUserId,
      openedByOfficerId: input.officerId,
      deptId: input.deptId,
      status: "open",
    });
  } else {
    // Re-asking on a closed thread reopens it rather than starting a new one.
    await db
      .update(clarificationThread)
      .set({ status: "open", updatedAt: new Date() })
      .where(eq(clarificationThread.id, threadId));
  }

  await db.insert(clarificationMessage).values({
    id: newId(),
    threadId,
    senderKind: "officer",
    officerId: input.officerId,
    body: input.body,
  });

  return { threadId, created: !existing };
}

/** An officer's reply on an existing thread. */
export async function officerReply(input: {
  threadId: string;
  officerId: string;
  body: string;
}): Promise<void> {
  await db.insert(clarificationMessage).values({
    id: newId(),
    threadId: input.threadId,
    senderKind: "officer",
    officerId: input.officerId,
    body: input.body,
  });

  await db
    .update(clarificationThread)
    .set({ status: "open", updatedAt: new Date() })
    .where(eq(clarificationThread.id, input.threadId));
}

/**
 * A citizen's reply, and the notification that pulls the department back in.
 *
 * Ownership is checked inside the query (`citizen_user_id = ?`), so replying to
 * somebody else's thread is indistinguishable from replying to one that does
 * not exist.
 */
export async function citizenReply(input: {
  threadId: string;
  citizenUserId: string;
  citizenName: string;
  body: string;
}): Promise<{ ok: true } | { error: "not_found" }> {
  const [thread] = await db
    .select({
      id: clarificationThread.id,
      issueId: clarificationThread.issueId,
      openedByOfficerId: clarificationThread.openedByOfficerId,
      issueCode: civicIssue.issueCode,
    })
    .from(clarificationThread)
    .innerJoin(civicIssue, eq(civicIssue.id, clarificationThread.issueId))
    .where(
      and(
        eq(clarificationThread.id, input.threadId),
        eq(clarificationThread.citizenUserId, input.citizenUserId),
      ),
    )
    .limit(1);

  if (!thread) return { error: "not_found" };

  await db.insert(clarificationMessage).values({
    id: newId(),
    threadId: thread.id,
    senderKind: "citizen",
    citizenUserId: input.citizenUserId,
    body: input.body,
  });

  await db
    .update(clarificationThread)
    .set({ updatedAt: new Date() })
    .where(eq(clarificationThread.id, thread.id));

  /*
   * An answer nobody notices is the same as no answer, so the officer who
   * asked gets an inbox entry carrying the issue code — the same doorway a
   * mention produces.
   */
  if (thread.openedByOfficerId) {
    await db.insert(officerNotification).values({
      id: newId(),
      officerId: thread.openedByOfficerId,
      kind: "clarification_reply",
      title: `${input.citizenName} replied to your question`,
      body: input.body.slice(0, 240),
      issueId: thread.issueId,
      issueCode: thread.issueCode,
      conversationId: null,
    });
  }

  return { ok: true };
}

/** Threads on an issue, for the department that owns it. */
export async function listThreadsForIssue(issueId: string): Promise<ClarificationThreadDto[]> {
  const rows = await db
    .select({
      id: clarificationThread.id,
      issueId: clarificationThread.issueId,
      issueCode: civicIssue.issueCode,
      reportId: clarificationThread.reportId,
      citizenUserId: clarificationThread.citizenUserId,
      citizenName: schema.user.name,
      status: clarificationThread.status,
    })
    .from(clarificationThread)
    .innerJoin(civicIssue, eq(civicIssue.id, clarificationThread.issueId))
    .leftJoin(schema.user, eq(schema.user.id, clarificationThread.citizenUserId))
    .where(eq(clarificationThread.issueId, issueId))
    .orderBy(desc(clarificationThread.updatedAt));

  return withCounts(rows);
}

/** Threads belonging to one citizen — their side of the conversation. */
export async function listThreadsForCitizen(
  citizenUserId: string,
): Promise<ClarificationThreadDto[]> {
  const rows = await db
    .select({
      id: clarificationThread.id,
      issueId: clarificationThread.issueId,
      issueCode: civicIssue.issueCode,
      reportId: clarificationThread.reportId,
      citizenUserId: clarificationThread.citizenUserId,
      citizenName: schema.user.name,
      status: clarificationThread.status,
    })
    .from(clarificationThread)
    .innerJoin(civicIssue, eq(civicIssue.id, clarificationThread.issueId))
    .leftJoin(schema.user, eq(schema.user.id, clarificationThread.citizenUserId))
    .where(eq(clarificationThread.citizenUserId, citizenUserId))
    .orderBy(desc(clarificationThread.updatedAt));

  return withCounts(rows);
}

/** Attaches message counts and per-side unread counts to a set of threads. */
async function withCounts(
  rows: {
    id: string;
    issueId: string;
    issueCode: string;
    reportId: string;
    citizenUserId: string;
    citizenName: string | null;
    status: string;
  }[],
): Promise<ClarificationThreadDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const stats = await db
    .select({
      threadId: clarificationMessage.threadId,
      count: sql<number>`count(*)::int`,
      lastAt: sql<Date>`max(${clarificationMessage.createdAt})`,
    })
    .from(clarificationMessage)
    .where(inArray(clarificationMessage.threadId, ids))
    .groupBy(clarificationMessage.threadId);

  // Unread is per-side: a citizen's unread is what the OFFICER sent, and vice
  // versa, so neither badge ever counts a person's own messages.
  const unread = await db
    .select({
      threadId: clarificationMessage.threadId,
      senderKind: clarificationMessage.senderKind,
      count: sql<number>`count(*)::int`,
    })
    .from(clarificationMessage)
    .where(
      and(inArray(clarificationMessage.threadId, ids), isNull(clarificationMessage.readAt)),
    )
    .groupBy(clarificationMessage.threadId, clarificationMessage.senderKind);

  return rows.map((row) => {
    const stat = stats.find((s) => s.threadId === row.id);
    return {
      ...row,
      status: row.status as "open" | "closed",
      messageCount: stat?.count ?? 0,
      lastMessageAt: stat?.lastAt ? new Date(stat.lastAt) : null,
      unreadForOfficer:
        unread.find((u) => u.threadId === row.id && u.senderKind === "citizen")?.count ?? 0,
      unreadForCitizen:
        unread.find((u) => u.threadId === row.id && u.senderKind === "officer")?.count ?? 0,
    };
  });
}

export async function listClarificationMessages(
  threadId: string,
): Promise<ClarificationMessageDto[]> {
  const rows = await db
    .select({
      id: clarificationMessage.id,
      senderKind: clarificationMessage.senderKind,
      body: clarificationMessage.body,
      readAt: clarificationMessage.readAt,
      createdAt: clarificationMessage.createdAt,
      officerName: schema.user.name,
    })
    .from(clarificationMessage)
    .leftJoin(govSchema.officer, eq(govSchema.officer.id, clarificationMessage.officerId))
    .leftJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(eq(clarificationMessage.threadId, threadId))
    .orderBy(asc(clarificationMessage.createdAt));

  return rows.map((row) => ({
    id: row.id,
    senderKind: row.senderKind as "officer" | "citizen",
    // The citizen sees "the department", not an individual's name: the case
    // belongs to the department, and staff change.
    authorName: row.senderKind === "officer" ? (row.officerName ?? "Department") : "You",
    body: row.body,
    readAt: row.readAt,
    createdAt: row.createdAt,
  }));
}

/** Loads a thread with the fields an access check needs. */
export async function findThread(threadId: string) {
  const [row] = await db
    .select({
      id: clarificationThread.id,
      issueId: clarificationThread.issueId,
      issueCode: civicIssue.issueCode,
      reportId: clarificationThread.reportId,
      citizenUserId: clarificationThread.citizenUserId,
      deptId: clarificationThread.deptId,
      orgId: civicIssue.orgId,
      issueDeptId: civicIssue.deptId,
      status: clarificationThread.status,
    })
    .from(clarificationThread)
    .innerJoin(civicIssue, eq(civicIssue.id, clarificationThread.issueId))
    .where(eq(clarificationThread.id, threadId))
    .limit(1);

  return row ?? null;
}

/** Marks the other side's messages as seen. Never marks your own. */
export async function markThreadRead(
  threadId: string,
  reader: "officer" | "citizen",
): Promise<void> {
  const from = reader === "officer" ? "citizen" : "officer";
  await db
    .update(clarificationMessage)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(clarificationMessage.threadId, threadId),
        eq(clarificationMessage.senderKind, from),
        isNull(clarificationMessage.readAt),
      ),
    );
}

export async function closeThread(threadId: string): Promise<void> {
  await db
    .update(clarificationThread)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(clarificationThread.id, threadId));
}
