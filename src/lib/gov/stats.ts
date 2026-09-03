import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { collabSchema } from "@/db/gov/collaboration";
import type { OfficerDto } from "./schema";

/*
 * The figures behind the operations dashboard and the analytics screen.
 *
 * One module, because the two screens must never disagree: an overview tile
 * reading 16 beside an analytics chart totalling 14 destroys trust in both,
 * and that is exactly what happens when each page writes its own aggregate.
 *
 * The distinction every number here respects: a REPORT is one citizen's
 * submission, an ISSUE is one real-world problem. A hundred people reporting
 * one pothole is 100 reports and 1 issue, and conflating them would tell a
 * department it has a hundred jobs when it has one.
 */

/** The rows an officer may aggregate over, scoped exactly as canViewIssue is. */
function scopeFor(officer: OfficerDto) {
  if (officer.role === "platform_admin") return undefined;
  if (officer.role === "org_head") {
    return officer.orgId ? eq(collabSchema.civicIssue.orgId, officer.orgId) : sql`false`;
  }
  return officer.deptId ? eq(collabSchema.civicIssue.deptId, officer.deptId) : sql`false`;
}

export interface GovOverview {
  /** Citizen submissions inside this officer's scope. */
  reports: number;
  /** Distinct real-world problems those reports represent. */
  issues: number;
  reported: number;
  inProcess: number;
  resolved: number;
  /** Reports that the similarity agent attached to an existing issue. */
  grouped: number;
  /** Issues no department owns yet — the routing backlog. */
  unrouted: number;
}

export async function getGovOverview(officer: OfficerDto): Promise<GovOverview> {
  const scope = scopeFor(officer);

  /*
   * Every issue in scope, with its assignment and terminal flag. Aggregated in
   * JS rather than in five separate COUNT queries: the row count here is small
   * (issues, not reports), and one pass guarantees the tiles are internally
   * consistent — five queries against a moving table can disagree with each
   * other by a row.
   */
  const rows = await db
    .select({
      issueId: collabSchema.civicIssue.id,
      reportCount: collabSchema.civicIssue.reportCount,
      deptId: collabSchema.civicIssue.deptId,
      stageId: govSchema.complaintAssignment.currentStageId,
      isTerminal: govSchema.deptWorkflowStage.isTerminal,
    })
    .from(collabSchema.civicIssue)
    .leftJoin(
      govSchema.complaintAssignment,
      eq(govSchema.complaintAssignment.issueId, collabSchema.civicIssue.id),
    )
    .leftJoin(
      govSchema.deptWorkflowStage,
      eq(govSchema.deptWorkflowStage.id, govSchema.complaintAssignment.currentStageId),
    )
    .where(scope);

  const overview: GovOverview = {
    reports: 0,
    issues: rows.length,
    reported: 0,
    inProcess: 0,
    resolved: 0,
    grouped: 0,
    unrouted: 0,
  };

  for (const row of rows) {
    overview.reports += row.reportCount;
    // Every report beyond the first on an issue is one the agent grouped.
    if (row.reportCount > 1) overview.grouped += row.reportCount - 1;

    if (row.deptId === null) overview.unrouted += 1;

    if (row.isTerminal) overview.resolved += 1;
    else if (row.stageId) overview.inProcess += 1;
    else overview.reported += 1;
  }

  return overview;
}

/** Reports received per week, oldest bucket first. Drives the trend bars. */
export async function getWeeklyReports(
  officer: OfficerDto,
  weeks = 8,
): Promise<{ label: string; value: number }[]> {
  const scope = scopeFor(officer);

  const rows = await db
    .select({ createdAt: schema.report.createdAt })
    .from(collabSchema.issueReport)
    .innerJoin(schema.report, eq(schema.report.id, collabSchema.issueReport.reportId))
    .innerJoin(
      collabSchema.civicIssue,
      eq(collabSchema.civicIssue.id, collabSchema.issueReport.issueId),
    )
    .where(scope);

  const now = Date.now();
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  return Array.from({ length: weeks }, (_, index) => {
    // Bucket 0 is the OLDEST, so the chart reads left to right as time passes.
    const age = weeks - 1 - index;
    const end = now - age * WEEK;
    const start = end - WEEK;

    return {
      label: age === 0 ? "Now" : `-${age}w`,
      value: rows.filter((row) => {
        const at = row.createdAt.getTime();
        return at > start && at <= end;
      }).length,
    };
  });
}

export interface DepartmentLoad {
  deptId: string;
  name: string;
  issues: number;
  reports: number;
  resolved: number;
  open: number;
}

/** Per-department workload. Null-department issues are excluded by the join. */
export async function getDepartmentLoad(officer: OfficerDto): Promise<DepartmentLoad[]> {
  const scope = scopeFor(officer);

  const rows = await db
    .select({
      deptId: govSchema.department.id,
      name: govSchema.department.name,
      reportCount: collabSchema.civicIssue.reportCount,
      isTerminal: govSchema.deptWorkflowStage.isTerminal,
    })
    .from(collabSchema.civicIssue)
    .innerJoin(
      govSchema.department,
      eq(govSchema.department.id, collabSchema.civicIssue.deptId),
    )
    .leftJoin(
      govSchema.complaintAssignment,
      eq(govSchema.complaintAssignment.issueId, collabSchema.civicIssue.id),
    )
    .leftJoin(
      govSchema.deptWorkflowStage,
      eq(govSchema.deptWorkflowStage.id, govSchema.complaintAssignment.currentStageId),
    )
    .where(scope)
    .orderBy(asc(govSchema.department.name));

  const byDept = new Map<string, DepartmentLoad>();

  for (const row of rows) {
    const entry = byDept.get(row.deptId) ?? {
      deptId: row.deptId,
      name: row.name,
      issues: 0,
      reports: 0,
      resolved: 0,
      open: 0,
    };

    entry.issues += 1;
    entry.reports += row.reportCount;
    if (row.isTerminal) entry.resolved += 1;
    else entry.open += 1;

    byDept.set(row.deptId, entry);
  }

  // Busiest first — the department that needs attention leads the list.
  return [...byDept.values()].sort((a, b) => b.reports - a.reports);
}

export interface ActivityEntry {
  id: string;
  title: string;
  actor: string | null;
  issueCode: string | null;
  at: Date;
}

/** The most recent things that happened, for the overview's activity panel. */
export async function getRecentActivity(
  officer: OfficerDto,
  limit = 6,
): Promise<ActivityEntry[]> {
  const scope = scopeFor(officer);

  const rows = await db
    .select({
      id: collabSchema.issueMessage.id,
      body: collabSchema.issueMessage.body,
      at: collabSchema.issueMessage.createdAt,
      actor: schema.user.name,
      issueCode: collabSchema.civicIssue.issueCode,
    })
    .from(collabSchema.issueMessage)
    .innerJoin(
      collabSchema.issueConversation,
      eq(collabSchema.issueConversation.id, collabSchema.issueMessage.conversationId),
    )
    .innerJoin(
      collabSchema.civicIssue,
      eq(collabSchema.civicIssue.id, collabSchema.issueConversation.issueId),
    )
    .leftJoin(govSchema.officer, eq(govSchema.officer.id, collabSchema.issueMessage.officerId))
    .leftJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(scope)
    .orderBy(sql`${collabSchema.issueMessage.createdAt} desc`)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    // Trimmed here rather than in the component: the panel is a summary, and a
    // 2000-character message would otherwise blow the layout apart.
    title: row.body.length > 90 ? `${row.body.slice(0, 90)}…` : row.body,
    actor: row.actor,
    issueCode: row.issueCode,
    at: row.at,
  }));
}

/** Issues with no department yet — what an org head actually has to act on. */
export async function countUnrouted(officer: OfficerDto): Promise<number> {
  const scope = scopeFor(officer);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(collabSchema.civicIssue)
    .where(scope ? and(scope, isNull(collabSchema.civicIssue.deptId)) : isNull(collabSchema.civicIssue.deptId));

  return row?.count ?? 0;
}
