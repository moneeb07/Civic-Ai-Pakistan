import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { report } from "@/db/schema";
import { govSchema } from "@/db/schema";
import { collabSchema } from "@/db/gov/collaboration";

const { civicIssue, issueReport } = collabSchema;
const { department, organization, complaintAssignment, deptWorkflowStage } = govSchema;


/*
 * What a CITIZEN may see about their own report.
 *
 * This is the bridge between the two halves of CivicAI, and it is deliberately
 * a narrow one. A citizen gets to know what happened to their complaint —
 * which real-world issue it became, how many neighbours reported the same
 * thing, which department holds it, and how far it has got. They do not get
 * the authority's internal working: no discussions, no member names, no
 * status notes, no other citizens' reports.
 *
 * Every query here is scoped by `userId` at the database level rather than
 * filtered afterwards, so a citizen cannot reach another citizen's report by
 * guessing an id.
 */

export interface TrackedReport {
  reportId: string;
  title: string | null;
  category: string | null;
  locationLabel: string | null;
  hasImage: boolean;
  submittedAt: Date;
  /** "ready_for_submission" once confirmed; earlier values are still drafts. */
  reportStatus: string;

  /** Null until the intake pipeline has placed this report on an issue. */
  issue: {
    issueCode: string;
    title: string;
    /** The department's current workflow stage, or null before assignment. */
    stageName: string | null;
    stagePosition: number | null;
    isResolved: boolean;
    /** How many citizens reported the same underlying problem. */
    reportCount: number;
    departmentName: string | null;
    orgName: string;
    /**
     * True when the similarity agent was not certain this report belongs
     * here. Shown to the citizen honestly rather than hidden.
     */
    needsReview: boolean;
    updatedAt: Date;
  } | null;
}

/** Every report this citizen has submitted, newest first. */
export async function listCitizenReports(userId: string): Promise<TrackedReport[]> {
  const rows = await db
    .select({
      reportId: report.id,
      title: report.title,
      category: report.category,
      locationLabel: report.locationLabel,
      imagePath: report.imagePath,
      submittedAt: report.createdAt,
      reportStatus: report.status,

      issueCode: civicIssue.issueCode,
      issueTitle: civicIssue.title,
      stageName: deptWorkflowStage.name,
      stagePosition: deptWorkflowStage.position,
      stageTerminal: deptWorkflowStage.isTerminal,
      reportCount: civicIssue.reportCount,
      issueUpdatedAt: civicIssue.updatedAt,
      departmentName: department.name,
      orgName: organization.name,
      matchStatus: issueReport.matchStatus,
    })
    .from(report)
    .leftJoin(issueReport, eq(issueReport.reportId, report.id))
    .leftJoin(civicIssue, eq(issueReport.issueId, civicIssue.id))
    .leftJoin(department, eq(civicIssue.deptId, department.id))
    .leftJoin(organization, eq(civicIssue.orgId, organization.id))
    /*
     * Progress is the department's own workflow stage, not a fixed three-state
     * enum: each department defines its own ordered stages, so what a citizen
     * is told mirrors exactly what the department is actually doing.
     */
    .leftJoin(complaintAssignment, eq(complaintAssignment.issueId, civicIssue.id))
    .leftJoin(deptWorkflowStage, eq(deptWorkflowStage.id, complaintAssignment.currentStageId))
    .where(eq(report.userId, userId))
    .orderBy(desc(report.createdAt));

  return rows.map((row) => ({
    reportId: row.reportId,
    title: row.title,
    category: row.category,
    locationLabel: row.locationLabel,
    hasImage: Boolean(row.imagePath),
    submittedAt: row.submittedAt,
    reportStatus: row.reportStatus,
    issue: row.issueCode
      ? {
          issueCode: row.issueCode,
          title: row.issueTitle ?? "",
          stageName: row.stageName ?? null,
          stagePosition: row.stagePosition ?? null,
          isResolved: row.stageTerminal === true,
          reportCount: row.reportCount ?? 1,
          departmentName: row.departmentName,
          orgName: row.orgName ?? "",
          needsReview: row.matchStatus === "needs_review",
          updatedAt: row.issueUpdatedAt ?? row.submittedAt,
        }
      : null,
  }));
}

export interface CitizenIssueDetail {
  issueCode: string;
  title: string;
  description: string | null;
  category: string;
  locationLabel: string | null;
  reportCount: number;
  departmentName: string | null;
  orgName: string;
  /** The stage the department is on now — the latest entered stage. */
  stageName: string | null;
  isResolved: boolean;
  createdAt: Date;
  /**
   * Status changes with timestamps only.
   *
   * Deliberately no member names and no internal notes: a citizen is entitled
   * to know their issue moved to In Process on a date, not to read the
   * department's internal reasoning about it.
   */
  timeline: { stageName: string; position: number; isTerminal: boolean; at: Date }[];
}

/**
 * One issue, but only if this citizen actually reported it.
 *
 * The ownership check is the whole point: without it, issue codes are
 * sequential and anyone could walk the range and read every civic issue in the
 * country. Returns null rather than throwing, so callers render a plain
 * "not found" instead of confirming that a code exists.
 */
export async function getCitizenIssue(
  issueCode: string,
  userId: string,
): Promise<CitizenIssueDetail | null> {
  const owned = await db
    .select({ reportId: issueReport.reportId })
    .from(issueReport)
    .innerJoin(civicIssue, eq(issueReport.issueId, civicIssue.id))
    .innerJoin(report, eq(issueReport.reportId, report.id))
    .where(and(eq(civicIssue.issueCode, issueCode), eq(report.userId, userId)))
    .limit(1);

  if (owned.length === 0) return null;

  const [row] = await db
    .select({
      id: civicIssue.id,
      issueCode: civicIssue.issueCode,
      title: civicIssue.title,
      description: civicIssue.description,
      category: civicIssue.category,
      locationLabel: civicIssue.locationLabel,
      reportCount: civicIssue.reportCount,
      departmentName: department.name,
      orgName: organization.name,
      createdAt: civicIssue.createdAt,
    })
    .from(civicIssue)
    .leftJoin(organization, eq(civicIssue.orgId, organization.id))
    .leftJoin(department, eq(civicIssue.deptId, department.id))
    .where(eq(civicIssue.issueCode, issueCode))
    .limit(1);

  if (!row) return null;

  /*
   * The timeline is the department's real stage history — one entry per stage
   * the complaint actually entered. A citizen sees the same progression the
   * department works to, named the way the department named it, rather than a
   * generic three-step bar that hides what is really happening.
   */
  const events = await db
    .select({
      stageName: govSchema.deptWorkflowStage.name,
      position: govSchema.deptWorkflowStage.position,
      isTerminal: govSchema.deptWorkflowStage.isTerminal,
      at: govSchema.complaintStageProgress.enteredAt,
    })
    .from(govSchema.complaintStageProgress)
    .innerJoin(
      govSchema.complaintAssignment,
      eq(govSchema.complaintAssignment.id, govSchema.complaintStageProgress.assignmentId),
    )
    .innerJoin(
      govSchema.deptWorkflowStage,
      eq(govSchema.deptWorkflowStage.id, govSchema.complaintStageProgress.stageId),
    )
    .where(eq(govSchema.complaintAssignment.issueId, row.id))
    .orderBy(asc(govSchema.complaintStageProgress.enteredAt));

  return {
    ...row,
    orgName: row.orgName ?? "",
    // The current stage is simply the most recently entered one.
    stageName: events.length > 0 ? events[events.length - 1].stageName : null,
    isResolved: events.some((e) => e.isTerminal),
    timeline: events.map((event) => ({
      stageName: event.stageName,
      position: event.position,
      isTerminal: event.isTerminal,
      at: event.at,
    })),
  };
}

/** Headline counts for the citizen's own dashboard. */
export async function getCitizenSummary(userId: string) {
  const reports = await listCitizenReports(userId);
  const withIssue = reports.filter((row) => row.issue !== null);

  return {
    total: reports.length,
    submitted: reports.filter((r) => r.reportStatus === "ready_for_submission").length,
    drafts: reports.filter((r) => r.reportStatus !== "ready_for_submission").length,
    reported: withIssue.filter((r) => r.issue!.stageName === null).length,
    inProcess: withIssue.filter((r) => r.issue!.stageName !== null && !r.issue!.isResolved).length,
    resolved: withIssue.filter((r) => r.issue!.isResolved).length,
  };
}

/**
 * Public performance figures, per organization. Contains nothing
 * citizen-specific and requires no session.
 *
 * "Resolved" means the complaint reached its department's own TERMINAL stage —
 * each department decides what finished means for its work, and this reads
 * that decision rather than imposing one.
 */
export async function getPublicPerformance() {
  const orgs = await db
    .select()
    .from(organization)
    .orderBy(asc(organization.name));
  if (orgs.length === 0) return [];

  const issues = await db
    .select({
      orgId: civicIssue.orgId,
      reportCount: civicIssue.reportCount,
      assignedStageId: govSchema.complaintAssignment.currentStageId,
      isTerminal: govSchema.deptWorkflowStage.isTerminal,
    })
    .from(civicIssue)
    .leftJoin(
      govSchema.complaintAssignment,
      eq(govSchema.complaintAssignment.issueId, civicIssue.id),
    )
    .leftJoin(
      govSchema.deptWorkflowStage,
      eq(govSchema.deptWorkflowStage.id, govSchema.complaintAssignment.currentStageId),
    );

  return orgs.map((row) => {
    const mine = issues.filter((issue) => issue.orgId === row.id);
    return {
      authorityId: row.id,
      authorityName: row.name,
      authorityCode: row.code,
      // Not yet routed into a department's workflow.
      reported: mine.filter((i) => i.assignedStageId === null).length,
      inProcess: mine.filter((i) => i.assignedStageId !== null && !i.isTerminal).length,
      resolved: mine.filter((i) => i.isTerminal === true).length,
      citizenReports: mine.reduce((sum, i) => sum + (i.reportCount ?? 0), 0),
    };
  });
}
