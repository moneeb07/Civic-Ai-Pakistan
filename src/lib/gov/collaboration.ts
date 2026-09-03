import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { collabSchema } from "@/db/gov/collaboration";
import { newId } from "./ids";
import { resolveMentions } from "./mentions";
import { canSeePrivateThread } from "./chat-access";
import type { OfficerDto } from "./schema";

/*
 * Issue collaboration: the threads officers hold about a civic issue, the
 * mentions inside them, and the inbox entries those mentions produce.
 *
 * The governing rule, and the reason this feature exists at all: coordinating
 * on a civic problem should never require leaving the system for email or
 * WhatsApp. So there is no rank gate anywhere in this file. A `member` and a
 * `dept_head` have identical rights in a thread — anyone can open one, anyone
 * can post, anyone can pull a colleague in. Role decides who ADMINISTERS the
 * department; it decides nothing about who may speak.
 *
 * The one boundary that does exist is the department. A thread belongs to an
 * issue, an issue belongs to a department, and only that department's officers
 * can reach it — which is the same 404-not-403 rule the rest of the gov side
 * follows.
 */

const { civicIssue, issueReport, issueConversation, conversationParticipant, issueMessage, messageMention, officerNotification } =
  collabSchema;

/* ==========================================================================
 * Access
 * ======================================================================== */

export interface IssueScope {
  id: string;
  issueCode: string;
  orgId: string | null;
  deptId: string | null;
}

/**
 * Loads an issue by its public code, or null.
 *
 * Returns the scope an access check needs and nothing more, so a caller cannot
 * accidentally render a field it never checked permission for.
 */
export async function findIssueByCode(issueCode: string): Promise<IssueScope | null> {
  const [row] = await db
    .select({
      id: civicIssue.id,
      issueCode: civicIssue.issueCode,
      orgId: civicIssue.orgId,
      deptId: civicIssue.deptId,
    })
    .from(civicIssue)
    .where(eq(civicIssue.issueCode, issueCode))
    .limit(1);

  return row ?? null;
}

/**
 * Whether an officer may open an issue at all.
 *
 * A platform admin reads everything. An org head reads their organization. A
 * dept head or member reads their department — and an unrouted issue, which no
 * department owns yet, is visible only above department level.
 */
export function canViewIssue(officer: OfficerDto, issue: IssueScope): boolean {
  if (officer.role === "platform_admin") return true;
  if (officer.role === "org_head") return Boolean(issue.orgId && officer.orgId === issue.orgId);
  return Boolean(issue.deptId && officer.deptId === issue.deptId);
}

/** Officers of one department — who may be mentioned, and who may be added to a thread. */
export async function listDepartmentOfficers(deptId: string) {
  return db
    .select({
      id: govSchema.officer.id,
      name: schema.user.name,
      email: schema.user.email,
      role: govSchema.officer.role,
    })
    .from(govSchema.officer)
    .innerJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(eq(govSchema.officer.deptId, deptId))
    .orderBy(asc(schema.user.name));
}

/* ==========================================================================
 * Threads
 * ======================================================================== */

export interface ConversationSummary {
  id: string;
  title: string;
  visibility: "department" | "private";
  messageCount: number;
  participantCount: number;
  lastMessageAt: Date | null;
}

/**
 * Threads on an issue that this officer may actually see.
 *
 * Private threads are filtered by participation here, in the query path, so a
 * thread an officer is not part of never reaches them — not even its title,
 * which would otherwise leak what colleagues are quietly working on.
 */
export async function listConversations(
  issueId: string,
  officerId: string,
): Promise<ConversationSummary[]> {
  const rows = await db
    .select({
      id: issueConversation.id,
      title: issueConversation.title,
      visibility: issueConversation.visibility,
    })
    .from(issueConversation)
    .where(eq(issueConversation.issueId, issueId))
    .orderBy(asc(issueConversation.createdAt));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const participants = await db
    .select({
      conversationId: conversationParticipant.conversationId,
      officerId: conversationParticipant.officerId,
    })
    .from(conversationParticipant)
    .where(inArray(conversationParticipant.conversationId, ids));

  const stats = await db
    .select({
      conversationId: issueMessage.conversationId,
      count: sql<number>`count(*)::int`,
      lastAt: sql<Date>`max(${issueMessage.createdAt})`,
    })
    .from(issueMessage)
    .where(inArray(issueMessage.conversationId, ids))
    .groupBy(issueMessage.conversationId);

  return rows
    .filter((row) =>
      row.visibility === "department"
        ? true
        : canSeePrivateThread(
            officerId,
            participants.filter((p) => p.conversationId === row.id).map((p) => p.officerId),
          ),
    )
    .map((row) => {
      const stat = stats.find((s) => s.conversationId === row.id);
      return {
        id: row.id,
        title: row.title,
        visibility: row.visibility as "department" | "private",
        messageCount: stat?.count ?? 0,
        participantCount: participants.filter((p) => p.conversationId === row.id).length,
        lastMessageAt: stat?.lastAt ? new Date(stat.lastAt) : null,
      };
    });
}

/** Opens a thread. Any officer with access to the issue may do this — no rank needed. */
export async function createConversation(input: {
  issueId: string;
  title: string;
  visibility: "department" | "private";
  createdByOfficerId: string;
  participantOfficerIds?: string[];
  deptId: string | null;
}): Promise<string> {
  const conversationId = newId();

  await db.insert(issueConversation).values({
    id: conversationId,
    issueId: input.issueId,
    title: input.title,
    visibility: input.visibility,
    createdByOfficerId: input.createdByOfficerId,
  });

  if (input.visibility === "private") {
    /*
     * Participants are filtered against the department roster rather than
     * trusted from the request: adding an officer from another department
     * would hand them a view of an issue they cannot otherwise open, turning a
     * private thread into a way around department isolation.
     */
    const roster = input.deptId ? await listDepartmentOfficers(input.deptId) : [];
    const allowed = new Set(roster.map((o) => o.id));

    const ids = new Set<string>([input.createdByOfficerId]);
    for (const id of input.participantOfficerIds ?? []) {
      if (allowed.has(id)) ids.add(id);
    }

    for (const officerId of ids) {
      await db.insert(conversationParticipant).values({
        id: newId(),
        conversationId,
        officerId,
        addedByOfficerId: input.createdByOfficerId,
      });
    }
  }

  return conversationId;
}

export async function findConversation(conversationId: string) {
  const [row] = await db
    .select({
      id: issueConversation.id,
      title: issueConversation.title,
      visibility: issueConversation.visibility,
      issueId: issueConversation.issueId,
      issueCode: civicIssue.issueCode,
      orgId: civicIssue.orgId,
      deptId: civicIssue.deptId,
    })
    .from(issueConversation)
    .innerJoin(civicIssue, eq(civicIssue.id, issueConversation.issueId))
    .where(eq(issueConversation.id, conversationId))
    .limit(1);

  if (!row) return null;
  return { ...row, visibility: row.visibility as "department" | "private" };
}

export async function listParticipantIds(conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ officerId: conversationParticipant.officerId })
    .from(conversationParticipant)
    .where(eq(conversationParticipant.conversationId, conversationId));
  return rows.map((r) => r.officerId);
}

/**
 * Adds an officer to a private thread.
 *
 * They immediately gain the ENTIRE history — there is no "joined at" cursor
 * anywhere in the read path. Somebody pulled into a discussion needs the
 * context that came before them; that is the whole reason they were added.
 */
export async function addParticipant(input: {
  conversationId: string;
  officerId: string;
  addedByOfficerId: string;
}): Promise<void> {
  const existing = await listParticipantIds(input.conversationId);
  if (existing.includes(input.officerId)) return;

  await db.insert(conversationParticipant).values({
    id: newId(),
    conversationId: input.conversationId,
    officerId: input.officerId,
    addedByOfficerId: input.addedByOfficerId,
  });
}

/* ==========================================================================
 * Messages and mentions
 * ======================================================================== */

export interface ConversationMessage {
  id: string;
  body: string;
  officerId: string;
  officerName: string;
  role: string;
  mentions: { officerId: string; name: string }[];
  createdAt: Date;
}

/** Every message, oldest first. Deliberately not filtered by when the reader joined. */
export async function listMessages(conversationId: string): Promise<ConversationMessage[]> {
  const rows = await db
    .select({
      id: issueMessage.id,
      body: issueMessage.body,
      officerId: issueMessage.officerId,
      officerName: schema.user.name,
      role: govSchema.officer.role,
      createdAt: issueMessage.createdAt,
    })
    .from(issueMessage)
    .innerJoin(govSchema.officer, eq(govSchema.officer.id, issueMessage.officerId))
    .innerJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(eq(issueMessage.conversationId, conversationId))
    .orderBy(asc(issueMessage.createdAt));

  if (rows.length === 0) return [];

  const mentions = await db
    .select({
      messageId: messageMention.messageId,
      officerId: messageMention.officerId,
      name: schema.user.name,
    })
    .from(messageMention)
    .innerJoin(govSchema.officer, eq(govSchema.officer.id, messageMention.officerId))
    .innerJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(inArray(messageMention.messageId, rows.map((r) => r.id)));

  return rows.map((row) => ({
    ...row,
    mentions: mentions
      .filter((m) => m.messageId === row.id)
      .map((m) => ({ officerId: m.officerId, name: m.name })),
  }));
}

/**
 * Posts a message, resolves its @mentions, and notifies the people mentioned.
 *
 * Mentions are resolved on the SERVER against the department roster, never
 * taken from the client. A name that does not resolve to a real officer of
 * this department stays plain text — so a mention can never notify someone
 * about work they cannot open, and the endpoint cannot be used to probe which
 * officers exist elsewhere in the organization.
 */
export async function postMessage(input: {
  conversationId: string;
  officerId: string;
  officerName: string;
  body: string;
  deptId: string | null;
  issueId: string;
  issueCode: string;
}): Promise<{ messageId: string; mentioned: string[] }> {
  const roster = input.deptId ? await listDepartmentOfficers(input.deptId) : [];

  const mentions = resolveMentions(
    input.body,
    roster.map((o) => ({ id: o.id, displayName: o.name, memberCode: o.email })),
  );

  const messageId = newId();

  await db.insert(issueMessage).values({
    id: messageId,
    conversationId: input.conversationId,
    officerId: input.officerId,
    body: input.body,
  });

  for (const mention of mentions) {
    await db.insert(messageMention).values({
      id: newId(),
      messageId,
      officerId: mention.memberId,
    });

    // Mentioning yourself is not news.
    if (mention.memberId === input.officerId) continue;

    /*
     * The inbox entry carries the issue code and the conversation id, so the
     * notification is a doorway rather than an announcement: tapping it lands
     * the officer in the exact thread they were named in, not on a dashboard
     * they then have to search.
     */
    await db.insert(officerNotification).values({
      id: newId(),
      officerId: mention.memberId,
      kind: "mention",
      title: `${input.officerName} mentioned you`,
      body: input.body.slice(0, 240),
      issueId: input.issueId,
      issueCode: input.issueCode,
      conversationId: input.conversationId,
      actorOfficerId: input.officerId,
    });
  }

  return { messageId, mentioned: mentions.map((m) => m.displayName) };
}

/* ==========================================================================
 * Officer inbox
 * ======================================================================== */

export interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  body: string;
  issueCode: string | null;
  conversationId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export async function listNotifications(
  officerId: string,
  limit = 50,
): Promise<NotificationDto[]> {
  return db
    .select({
      id: officerNotification.id,
      kind: officerNotification.kind,
      title: officerNotification.title,
      body: officerNotification.body,
      issueCode: officerNotification.issueCode,
      conversationId: officerNotification.conversationId,
      readAt: officerNotification.readAt,
      createdAt: officerNotification.createdAt,
    })
    .from(officerNotification)
    .where(eq(officerNotification.officerId, officerId))
    .orderBy(desc(officerNotification.createdAt))
    .limit(limit);
}

export async function countUnread(officerId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(officerNotification)
    .where(
      and(eq(officerNotification.officerId, officerId), isNull(officerNotification.readAt)),
    );
  return row?.count ?? 0;
}

/** Scoped by officerId in the WHERE clause, so one officer cannot clear another's inbox. */
export async function markNotificationRead(
  notificationId: string,
  officerId: string,
): Promise<void> {
  await db
    .update(officerNotification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(officerNotification.id, notificationId),
        eq(officerNotification.officerId, officerId),
      ),
    );
}

export async function markAllNotificationsRead(officerId: string): Promise<void> {
  await db
    .update(officerNotification)
    .set({ readAt: new Date() })
    .where(
      and(eq(officerNotification.officerId, officerId), isNull(officerNotification.readAt)),
    );
}

/* ==========================================================================
 * Grouped reports behind an issue
 * ======================================================================== */

/** The citizen reports grouped into this issue, with how each one got here. */
export async function listIssueReports(issueId: string) {
  return db
    .select({
      linkId: issueReport.id,
      reportId: issueReport.reportId,
      matchStatus: issueReport.matchStatus,
      similarity: issueReport.similarity,
      matchRationale: issueReport.matchRationale,
      title: schema.report.title,
      description: schema.report.description,
      transcript: schema.report.transcript,
      locationLabel: schema.report.locationLabel,
      createdAt: schema.report.createdAt,
      citizenUserId: schema.report.userId,
    })
    .from(issueReport)
    .innerJoin(schema.report, eq(schema.report.id, issueReport.reportId))
    .where(eq(issueReport.issueId, issueId))
    .orderBy(asc(schema.report.createdAt));
}

/* ==========================================================================
 * Issue detail
 * ======================================================================== */

/**
 * The full issue record for its workspace page.
 *
 * Separate from `findIssueByCode`, which deliberately returns only the four
 * scope fields an access check needs: the caller has to pass the check before
 * anything else about the issue is loaded.
 */
export async function getIssueDetail(issueId: string) {
  const [row] = await db
    .select({
      id: civicIssue.id,
      issueCode: civicIssue.issueCode,
      title: civicIssue.title,
      description: civicIssue.description,
      category: civicIssue.category,
      severity: civicIssue.severity,
      locationLabel: civicIssue.locationLabel,
      reportCount: civicIssue.reportCount,
      routingConfidence: civicIssue.routingConfidence,
      routingRationale: civicIssue.routingRationale,
      routingSource: civicIssue.routingSource,
      createdAt: civicIssue.createdAt,
      orgName: govSchema.organization.name,
      deptName: govSchema.department.name,
    })
    .from(civicIssue)
    .leftJoin(govSchema.organization, eq(govSchema.organization.id, civicIssue.orgId))
    .leftJoin(govSchema.department, eq(govSchema.department.id, civicIssue.deptId))
    .where(eq(civicIssue.id, issueId))
    .limit(1);

  return row ?? null;
}

/**
 * The issues an officer may see, newest first.
 *
 * The scope rules are the list-shaped twin of `canViewIssue`, expressed as a
 * WHERE clause rather than a filter over fetched rows: an issue outside the
 * officer's scope never leaves the database, so there is no version of this
 * that leaks a count or a title through pagination.
 *
 * The one asymmetry worth noting is unrouted issues (`dept_id IS NULL`). Nobody
 * owns them yet, so they appear for admins and org heads — who are the people
 * able to route them — and not for department staff.
 */
export async function listIssuesForOfficer(
  officer: OfficerDto,
  options: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(options.limit ?? 50, 100);

  const scope =
    officer.role === "platform_admin"
      ? undefined
      : officer.role === "org_head"
        ? officer.orgId
          ? eq(civicIssue.orgId, officer.orgId)
          : sql`false`
        : officer.deptId
          ? eq(civicIssue.deptId, officer.deptId)
          : sql`false`;

  return db
    .select({
      id: civicIssue.id,
      issueCode: civicIssue.issueCode,
      title: civicIssue.title,
      category: civicIssue.category,
      severity: civicIssue.severity,
      locationLabel: civicIssue.locationLabel,
      reportCount: civicIssue.reportCount,
      deptId: civicIssue.deptId,
      deptName: govSchema.department.name,
      routingConfidence: civicIssue.routingConfidence,
      createdAt: civicIssue.createdAt,
    })
    .from(civicIssue)
    .leftJoin(govSchema.department, eq(govSchema.department.id, civicIssue.deptId))
    .where(scope)
    .orderBy(desc(civicIssue.createdAt))
    .limit(limit)
    .offset(options.offset ?? 0);
}
