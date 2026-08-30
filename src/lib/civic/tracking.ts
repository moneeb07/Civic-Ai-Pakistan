import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { report } from "@/db/schema";
import {
  authority,
  civicIssue,
  department,
  issueReport,
  issueStatusEvent,
} from "@/db/authority/schema";
import type { IssueStatus } from "@/lib/authority/schema";

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
    status: IssueStatus;
    /** How many citizens reported the same underlying problem. */
    reportCount: number;
    departmentName: string | null;
    authorityName: string;
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
      issueStatus: civicIssue.status,
      reportCount: civicIssue.reportCount,
      issueUpdatedAt: civicIssue.updatedAt,
      departmentName: department.name,
      authorityName: authority.name,
      matchStatus: issueReport.matchStatus,
    })
    .from(report)
    .leftJoin(issueReport, eq(issueReport.reportId, report.id))
    .leftJoin(civicIssue, eq(issueReport.issueId, civicIssue.id))
    .leftJoin(department, eq(civicIssue.departmentId, department.id))
    .leftJoin(authority, eq(civicIssue.authorityId, authority.id))
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
          status: (row.issueStatus ?? "REPORTED") as IssueStatus,
          reportCount: row.reportCount ?? 1,
          departmentName: row.departmentName,
          authorityName: row.authorityName ?? "",
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
  status: IssueStatus;
  locationLabel: string | null;
  reportCount: number;
  departmentName: string | null;
  authorityName: string;
  createdAt: Date;
  /**
   * Status changes with timestamps only.
   *
   * Deliberately no member names and no internal notes: a citizen is entitled
   * to know their issue moved to In Process on a date, not to read the
   * department's internal reasoning about it.
   */
  timeline: { status: IssueStatus; at: Date }[];
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
      status: civicIssue.status,
      locationLabel: civicIssue.locationLabel,
      reportCount: civicIssue.reportCount,
      departmentName: department.name,
      authorityName: authority.name,
      createdAt: civicIssue.createdAt,
    })
    .from(civicIssue)
    .innerJoin(authority, eq(civicIssue.authorityId, authority.id))
    .leftJoin(department, eq(civicIssue.departmentId, department.id))
    .where(eq(civicIssue.issueCode, issueCode))
    .limit(1);

  if (!row) return null;

  const events = await db
    .select({ toStatus: issueStatusEvent.toStatus, createdAt: issueStatusEvent.createdAt })
    .from(issueStatusEvent)
    .where(eq(issueStatusEvent.issueId, row.id))
    .orderBy(asc(issueStatusEvent.createdAt));

  return {
    ...row,
    status: row.status as IssueStatus,
    authorityName: row.authorityName ?? "",
    timeline: events.map((event) => ({
      status: event.toStatus as IssueStatus,
      at: event.createdAt,
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
    reported: withIssue.filter((r) => r.issue!.status === "REPORTED").length,
    inProcess: withIssue.filter((r) => r.issue!.status === "IN_PROCESS").length,
    resolved: withIssue.filter((r) => r.issue!.status === "RESOLVED").length,
  };
}

/** Public, authority-level performance figures. Contains nothing citizen-specific. */
export async function getPublicPerformance() {
  const authorities = await db.select().from(authority).orderBy(asc(authority.name));
  if (authorities.length === 0) return [];

  const issues = await db
    .select({
      authorityId: civicIssue.authorityId,
      status: civicIssue.status,
      reportCount: civicIssue.reportCount,
    })
    .from(civicIssue)
    .where(
      inArray(
        civicIssue.authorityId,
        authorities.map((row) => row.id),
      ),
    );

  return authorities.map((row) => {
    const mine = issues.filter((issue) => issue.authorityId === row.id);
    return {
      authorityId: row.id,
      authorityName: row.name,
      authorityCode: row.code,
      reported: mine.filter((i) => i.status === "REPORTED").length,
      inProcess: mine.filter((i) => i.status === "IN_PROCESS").length,
      resolved: mine.filter((i) => i.status === "RESOLVED").length,
      citizenReports: mine.reduce((sum, i) => sum + i.reportCount, 0),
    };
  });
}
