import "server-only";

import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { report } from "@/db/schema";
import {
  authority,
  authorityMember,
  civicIssue,
  conversationParticipant,
  department,
  issueConversation,
  issueMessage,
  issueReport,
  issueStatusEvent,
  messageMention,
} from "@/db/authority/schema";
import { parseDepartmentCategories } from "@/lib/authority/routing";
import {
  normaliseIssueCode,
  type AccessType,
  type ConversationVisibility,
  type IssueStatus,
  type MatchStatus,
} from "@/lib/authority/schema";

/*
 * Read-side queries for the authority dashboards and the issue workspace.
 *
 * Every function here takes the scope it is allowed to read as an argument
 * (an authority id, a list of department ids) rather than working it out from
 * a session. Deciding access is access.ts's job; this file only ever reads
 * within the boundary it is handed, which keeps "who may see this" in one
 * place instead of scattered through a dozen SELECTs.
 */

// -- Statistics --------------------------------------------------------------

export interface AuthorityStats {
  /** Every citizen report that reached an issue. */
  citizenReports: number;
  /** Distinct underlying problems. The number that makes CivicAI's point. */
  civicIssues: number;
  reported: number;
  inProcess: number;
  resolved: number;
  /**
   * Reports the similarity agent folded into an existing issue — the reports
   * a department did NOT have to triage by hand.
   */
  groupedDuplicates: number;
  /** Links the agent was unsure about, waiting on a member to confirm. */
  awaitingReview: number;
  unrouted: number;
}

export async function getAuthorityStats(
  authorityId: string,
  departmentIds?: string[],
): Promise<AuthorityStats> {
  const scope = departmentIds
    ? and(
        eq(civicIssue.authorityId, authorityId),
        departmentIds.length > 0
          ? inArray(civicIssue.departmentId, departmentIds)
          : sql`false`,
      )
    : eq(civicIssue.authorityId, authorityId);

  const issues = await db
    .select({
      id: civicIssue.id,
      status: civicIssue.status,
      reportCount: civicIssue.reportCount,
      departmentId: civicIssue.departmentId,
    })
    .from(civicIssue)
    .where(scope);

  const issueIds = issues.map((row) => row.id);

  const links = issueIds.length
    ? await db
        .select({ matchStatus: issueReport.matchStatus })
        .from(issueReport)
        .where(inArray(issueReport.issueId, issueIds))
    : [];

  return {
    citizenReports: issues.reduce((total, row) => total + row.reportCount, 0),
    civicIssues: issues.length,
    reported: issues.filter((row) => row.status === "REPORTED").length,
    inProcess: issues.filter((row) => row.status === "IN_PROCESS").length,
    resolved: issues.filter((row) => row.status === "RESOLVED").length,
    groupedDuplicates: links.filter(
      (row) => row.matchStatus === "auto_grouped" || row.matchStatus === "confirmed",
    ).length,
    awaitingReview: links.filter((row) => row.matchStatus === "needs_review").length,
    unrouted: issues.filter((row) => row.departmentId === null).length,
  };
}

// -- Departments -------------------------------------------------------------

export interface DepartmentSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categories: string[];
  memberCount: number;
  issueCount: number;
  openCount: number;
}

export async function listDepartments(
  authorityId: string,
): Promise<DepartmentSummary[]> {
  const rows = await db
    .select()
    .from(department)
    .where(eq(department.authorityId, authorityId))
    .orderBy(asc(department.name));

  const memberCounts = await db
    .select({
      departmentId: authorityMember.departmentId,
      count: sql<number>`count(*)::int`,
    })
    .from(authorityMember)
    .where(
      and(eq(authorityMember.authorityId, authorityId), eq(authorityMember.active, true)),
    )
    .groupBy(authorityMember.departmentId);

  const issueCounts = await db
    .select({
      departmentId: civicIssue.departmentId,
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${civicIssue.status} <> 'RESOLVED')::int`,
    })
    .from(civicIssue)
    .where(eq(civicIssue.authorityId, authorityId))
    .groupBy(civicIssue.departmentId);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    categories: parseDepartmentCategories(row.categories),
    memberCount: memberCounts.find((m) => m.departmentId === row.id)?.count ?? 0,
    issueCount: issueCounts.find((i) => i.departmentId === row.id)?.total ?? 0,
    openCount: issueCounts.find((i) => i.departmentId === row.id)?.open ?? 0,
  }));
}

export async function getDepartment(departmentId: string) {
  const [row] = await db
    .select({
      id: department.id,
      name: department.name,
      slug: department.slug,
      description: department.description,
      categories: department.categories,
      authorityId: department.authorityId,
      authorityName: authority.name,
      authorityCode: authority.code,
    })
    .from(department)
    .innerJoin(authority, eq(department.authorityId, authority.id))
    .where(eq(department.id, departmentId))
    .limit(1);

  if (!row) return null;
  return { ...row, categories: parseDepartmentCategories(row.categories) };
}

// -- Members -----------------------------------------------------------------

export interface MemberSummary {
  id: string;
  memberCode: string;
  displayName: string;
  accessType: AccessType;
  departmentId: string | null;
  departmentName: string | null;
}

/** Members of one department — the people who can be mentioned on its issues. */
export async function listDepartmentMembers(
  departmentId: string,
): Promise<MemberSummary[]> {
  const rows = await db
    .select({
      id: authorityMember.id,
      memberCode: authorityMember.memberCode,
      displayName: authorityMember.displayName,
      accessType: authorityMember.accessType,
      departmentId: authorityMember.departmentId,
      departmentName: department.name,
    })
    .from(authorityMember)
    .leftJoin(department, eq(authorityMember.departmentId, department.id))
    .where(
      and(eq(authorityMember.departmentId, departmentId), eq(authorityMember.active, true)),
    )
    .orderBy(asc(authorityMember.displayName));

  return rows.map((row) => ({ ...row, accessType: row.accessType as AccessType }));
}

export async function listAuthorityMembers(
  authorityId: string,
): Promise<MemberSummary[]> {
  const rows = await db
    .select({
      id: authorityMember.id,
      memberCode: authorityMember.memberCode,
      displayName: authorityMember.displayName,
      accessType: authorityMember.accessType,
      departmentId: authorityMember.departmentId,
      departmentName: department.name,
    })
    .from(authorityMember)
    .leftJoin(department, eq(authorityMember.departmentId, department.id))
    .where(
      and(eq(authorityMember.authorityId, authorityId), eq(authorityMember.active, true)),
    )
    .orderBy(asc(authorityMember.displayName));

  return rows.map((row) => ({ ...row, accessType: row.accessType as AccessType }));
}

// -- Issues ------------------------------------------------------------------

export interface IssueListItem {
  id: string;
  issueCode: string;
  title: string;
  category: string;
  status: IssueStatus;
  severity: string | null;
  locationLabel: string | null;
  reportCount: number;
  departmentId: string | null;
  departmentName: string | null;
  needsReviewCount: number;
  updatedAt: Date;
}

export interface IssueFilter {
  authorityId: string;
  /** Undefined means "every department" — only ever passed for an admin. */
  departmentIds?: string[];
  status?: IssueStatus;
  /** Matches an issue code, title or location. */
  search?: string;
  limit?: number;
}

export async function listIssues(filter: IssueFilter): Promise<IssueListItem[]> {
  const conditions = [eq(civicIssue.authorityId, filter.authorityId)];

  if (filter.departmentIds) {
    // An empty scope must return nothing, not everything.
    conditions.push(
      filter.departmentIds.length > 0
        ? inArray(civicIssue.departmentId, filter.departmentIds)
        : sql`false`,
    );
  }

  if (filter.status) conditions.push(eq(civicIssue.status, filter.status));

  if (filter.search?.trim()) {
    const term = `%${filter.search.trim().toLowerCase()}%`;
    const code = `%${normaliseIssueCode(filter.search)}%`;
    conditions.push(
      or(
        sql`lower(${civicIssue.title}) like ${term}`,
        sql`upper(${civicIssue.issueCode}) like ${code}`,
        sql`lower(coalesce(${civicIssue.locationLabel}, '')) like ${term}`,
      )!,
    );
  }

  const rows = await db
    .select({
      id: civicIssue.id,
      issueCode: civicIssue.issueCode,
      title: civicIssue.title,
      category: civicIssue.category,
      status: civicIssue.status,
      severity: civicIssue.severity,
      locationLabel: civicIssue.locationLabel,
      reportCount: civicIssue.reportCount,
      departmentId: civicIssue.departmentId,
      departmentName: department.name,
      updatedAt: civicIssue.updatedAt,
    })
    .from(civicIssue)
    .leftJoin(department, eq(civicIssue.departmentId, department.id))
    .where(and(...conditions))
    .orderBy(desc(civicIssue.reportCount), desc(civicIssue.updatedAt))
    .limit(filter.limit ?? 100);

  const ids = rows.map((row) => row.id);
  const reviewCounts = ids.length
    ? await db
        .select({ issueId: issueReport.issueId, count: sql<number>`count(*)::int` })
        .from(issueReport)
        .where(
          and(inArray(issueReport.issueId, ids), eq(issueReport.matchStatus, "needs_review")),
        )
        .groupBy(issueReport.issueId)
    : [];

  return rows.map((row) => ({
    ...row,
    status: row.status as IssueStatus,
    needsReviewCount: reviewCounts.find((r) => r.issueId === row.id)?.count ?? 0,
  }));
}

// -- One issue ---------------------------------------------------------------

export interface LinkedReport {
  linkId: string;
  reportId: string;
  matchStatus: MatchStatus;
  similarity: number | null;
  matchRationale: string | null;
  title: string | null;
  description: string | null;
  transcript: string | null;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  hasImage: boolean;
  visionConfidence: number | null;
  createdAt: Date;
}

export interface StatusEvent {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  memberName: string | null;
  memberCode: string | null;
  createdAt: Date;
}

export interface ConversationSummary {
  id: string;
  title: string;
  visibility: ConversationVisibility;
  messageCount: number;
  participantCount: number;
  lastMessageAt: Date | null;
}

export async function getIssueByCode(issueCode: string) {
  const [row] = await db
    .select({
      id: civicIssue.id,
      issueCode: civicIssue.issueCode,
      title: civicIssue.title,
      description: civicIssue.description,
      category: civicIssue.category,
      status: civicIssue.status,
      severity: civicIssue.severity,
      latitude: civicIssue.latitude,
      longitude: civicIssue.longitude,
      locationLabel: civicIssue.locationLabel,
      reportCount: civicIssue.reportCount,
      routingConfidence: civicIssue.routingConfidence,
      routingRationale: civicIssue.routingRationale,
      routingSource: civicIssue.routingSource,
      authorityId: civicIssue.authorityId,
      authorityName: authority.name,
      departmentId: civicIssue.departmentId,
      departmentName: department.name,
      createdAt: civicIssue.createdAt,
      updatedAt: civicIssue.updatedAt,
    })
    .from(civicIssue)
    .innerJoin(authority, eq(civicIssue.authorityId, authority.id))
    .leftJoin(department, eq(civicIssue.departmentId, department.id))
    .where(eq(civicIssue.issueCode, normaliseIssueCode(issueCode)))
    .limit(1);

  if (!row) return null;
  return { ...row, status: row.status as IssueStatus };
}

export async function listIssueReports(issueId: string): Promise<LinkedReport[]> {
  const rows = await db
    .select({
      linkId: issueReport.id,
      reportId: issueReport.reportId,
      matchStatus: issueReport.matchStatus,
      similarity: issueReport.similarity,
      matchRationale: issueReport.matchRationale,
      title: report.title,
      description: report.description,
      transcript: report.transcript,
      locationLabel: report.locationLabel,
      latitude: report.latitude,
      longitude: report.longitude,
      imagePath: report.imagePath,
      visionConfidence: report.visionConfidence,
      createdAt: report.createdAt,
    })
    .from(issueReport)
    .innerJoin(report, eq(issueReport.reportId, report.id))
    .where(eq(issueReport.issueId, issueId))
    .orderBy(asc(report.createdAt));

  return rows.map(({ imagePath, ...rest }) => ({
    ...rest,
    matchStatus: rest.matchStatus as MatchStatus,
    hasImage: Boolean(imagePath),
  }));
}

export async function listStatusHistory(issueId: string): Promise<StatusEvent[]> {
  return db
    .select({
      id: issueStatusEvent.id,
      fromStatus: issueStatusEvent.fromStatus,
      toStatus: issueStatusEvent.toStatus,
      note: issueStatusEvent.note,
      memberName: authorityMember.displayName,
      memberCode: authorityMember.memberCode,
      createdAt: issueStatusEvent.createdAt,
    })
    .from(issueStatusEvent)
    .leftJoin(authorityMember, eq(issueStatusEvent.memberId, authorityMember.id))
    .where(eq(issueStatusEvent.issueId, issueId))
    .orderBy(asc(issueStatusEvent.createdAt));
}

/**
 * Conversations on an issue that the given member ids may actually see.
 *
 * Department threads are visible to everyone with access to the issue; private
 * threads only to their participants. The filtering happens in SQL rather than
 * after the fact, so a private thread the viewer is not in never reaches the
 * page at all — not even its title.
 */
export async function listConversations(
  issueId: string,
  viewerMemberIds: string[],
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

  const ids = rows.map((row) => row.id);

  const participants = await db
    .select({
      conversationId: conversationParticipant.conversationId,
      memberId: conversationParticipant.memberId,
    })
    .from(conversationParticipant)
    .where(inArray(conversationParticipant.conversationId, ids));

  const messages = await db
    .select({
      conversationId: issueMessage.conversationId,
      count: sql<number>`count(*)::int`,
      lastAt: sql<Date>`max(${issueMessage.createdAt})`,
    })
    .from(issueMessage)
    .where(inArray(issueMessage.conversationId, ids))
    .groupBy(issueMessage.conversationId);

  return rows
    .filter((row) => {
      if (row.visibility === "department") return true;
      return participants.some(
        (p) => p.conversationId === row.id && viewerMemberIds.includes(p.memberId),
      );
    })
    .map((row) => {
      const stats = messages.find((m) => m.conversationId === row.id);
      return {
        id: row.id,
        title: row.title,
        visibility: row.visibility as ConversationVisibility,
        messageCount: stats?.count ?? 0,
        participantCount: participants.filter((p) => p.conversationId === row.id).length,
        lastMessageAt: stats?.lastAt ? new Date(stats.lastAt) : null,
      };
    });
}

export interface ConversationMessage {
  id: string;
  body: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  mentions: { memberId: string; displayName: string }[];
  createdAt: Date;
}

/**
 * Every message in a conversation, oldest first.
 *
 * Deliberately unfiltered by when the reader joined: a participant added later
 * sees the whole history. Someone brought into a discussion needs the context
 * that came before them — that is the reason they were added.
 */
export async function listMessages(
  conversationId: string,
): Promise<ConversationMessage[]> {
  const rows = await db
    .select({
      id: issueMessage.id,
      body: issueMessage.body,
      memberId: issueMessage.memberId,
      memberName: authorityMember.displayName,
      memberCode: authorityMember.memberCode,
      createdAt: issueMessage.createdAt,
    })
    .from(issueMessage)
    .innerJoin(authorityMember, eq(issueMessage.memberId, authorityMember.id))
    .where(eq(issueMessage.conversationId, conversationId))
    .orderBy(asc(issueMessage.createdAt));

  if (rows.length === 0) return [];

  const mentions = await db
    .select({
      messageId: messageMention.messageId,
      memberId: messageMention.memberId,
      displayName: authorityMember.displayName,
    })
    .from(messageMention)
    .innerJoin(authorityMember, eq(messageMention.memberId, authorityMember.id))
    .where(
      inArray(
        messageMention.messageId,
        rows.map((row) => row.id),
      ),
    );

  return rows.map((row) => ({
    ...row,
    mentions: mentions
      .filter((m) => m.messageId === row.id)
      .map((m) => ({ memberId: m.memberId, displayName: m.displayName })),
  }));
}

export async function listParticipants(conversationId: string) {
  return db
    .select({
      memberId: conversationParticipant.memberId,
      displayName: authorityMember.displayName,
      memberCode: authorityMember.memberCode,
      addedAt: conversationParticipant.addedAt,
    })
    .from(conversationParticipant)
    .innerJoin(authorityMember, eq(conversationParticipant.memberId, authorityMember.id))
    .where(eq(conversationParticipant.conversationId, conversationId))
    .orderBy(asc(conversationParticipant.addedAt));
}

// -- Cross-issue views -------------------------------------------------------

export interface RecentDiscussion {
  conversationId: string;
  title: string;
  visibility: ConversationVisibility;
  issueCode: string;
  issueTitle: string;
  departmentName: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  lastAuthor: string | null;
}

/**
 * Discussions across every issue the viewer can reach, newest activity first.
 *
 * Private threads are filtered by participation in the same pass, so a thread
 * the viewer is not in never reaches the page — not even its title, which
 * would otherwise leak what colleagues are quietly working on.
 */
export async function listRecentDiscussions(
  authorityId: string,
  departmentIds: string[] | undefined,
  viewerMemberIds: string[],
  limit = 30,
): Promise<RecentDiscussion[]> {
  const scope = departmentIds
    ? and(
        eq(civicIssue.authorityId, authorityId),
        departmentIds.length > 0
          ? inArray(civicIssue.departmentId, departmentIds)
          : sql`false`,
      )
    : eq(civicIssue.authorityId, authorityId);

  const rows = await db
    .select({
      conversationId: issueConversation.id,
      title: issueConversation.title,
      visibility: issueConversation.visibility,
      issueCode: civicIssue.issueCode,
      issueTitle: civicIssue.title,
      departmentName: department.name,
    })
    .from(issueConversation)
    .innerJoin(civicIssue, eq(issueConversation.issueId, civicIssue.id))
    .leftJoin(department, eq(civicIssue.departmentId, department.id))
    .where(scope);

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.conversationId);

  const participants = await db
    .select({
      conversationId: conversationParticipant.conversationId,
      memberId: conversationParticipant.memberId,
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

  const visible = rows.filter((row) => {
    if (row.visibility === "department") return true;
    return participants.some(
      (p) => p.conversationId === row.conversationId && viewerMemberIds.includes(p.memberId),
    );
  });

  return visible
    .map((row) => {
      const stat = stats.find((s) => s.conversationId === row.conversationId);
      return {
        conversationId: row.conversationId,
        title: row.title,
        visibility: row.visibility as ConversationVisibility,
        issueCode: row.issueCode,
        issueTitle: row.issueTitle,
        departmentName: row.departmentName,
        messageCount: stat?.count ?? 0,
        lastMessageAt: stat?.lastAt ? new Date(stat.lastAt) : null,
        lastAuthor: null,
      };
    })
    .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0))
    .slice(0, limit);
}

export interface CategoryBreakdown {
  category: string;
  issues: number;
  reports: number;
  resolved: number;
}

/** Issue volume by category — which problems this authority actually faces. */
export async function categoryBreakdown(
  authorityId: string,
  departmentIds?: string[],
): Promise<CategoryBreakdown[]> {
  const scope = departmentIds
    ? and(
        eq(civicIssue.authorityId, authorityId),
        departmentIds.length > 0
          ? inArray(civicIssue.departmentId, departmentIds)
          : sql`false`,
      )
    : eq(civicIssue.authorityId, authorityId);

  const rows = await db
    .select({
      category: civicIssue.category,
      status: civicIssue.status,
      reportCount: civicIssue.reportCount,
    })
    .from(civicIssue)
    .where(scope);

  const map = new Map<string, CategoryBreakdown>();
  for (const row of rows) {
    const entry = map.get(row.category) ?? {
      category: row.category,
      issues: 0,
      reports: 0,
      resolved: 0,
    };
    entry.issues += 1;
    entry.reports += row.reportCount;
    if (row.status === "RESOLVED") entry.resolved += 1;
    map.set(row.category, entry);
  }

  return [...map.values()].sort((a, b) => b.reports - a.reports);
}
