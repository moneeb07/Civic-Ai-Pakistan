import "server-only";

import { asc, desc, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db";
import { schema } from "@/db/schema";
import { collabSchema } from "@/db/gov/collaboration";
import type { OfficerDto } from "./schema";

/*
 * Worked examples for the AI grouping screen.
 *
 * Real issues from the officer's own scope, never a fabricated illustration:
 * an officer deciding whether to trust the grouping needs to see it working on
 * cases they recognise. A demo with invented street names proves nothing.
 */

export interface GroupedExample {
  issueId: string;
  issueCode: string;
  title: string;
  reportCount: number;
  rationale: string | null;
  /** Reports the agent grouped provisionally rather than confidently. */
  needsReview: number;
  reports: {
    reportId: string;
    title: string | null;
    matchStatus: string;
    similarity: number | null;
  }[];
}

function scopeFor(officer: OfficerDto) {
  if (officer.role === "platform_admin") return undefined;
  if (officer.role === "org_head") {
    return officer.orgId ? eq(collabSchema.civicIssue.orgId, officer.orgId) : sql`false`;
  }
  return officer.deptId ? eq(collabSchema.civicIssue.deptId, officer.deptId) : sql`false`;
}

export async function listGroupedExamples(
  officer: OfficerDto,
  limit = 3,
): Promise<GroupedExample[]> {
  const scope = scopeFor(officer);

  // Only issues that actually grouped something — an issue with one report
  // demonstrates nothing about grouping.
  const issues = await db
    .select({
      id: collabSchema.civicIssue.id,
      issueCode: collabSchema.civicIssue.issueCode,
      title: collabSchema.civicIssue.title,
      reportCount: collabSchema.civicIssue.reportCount,
      rationale: collabSchema.civicIssue.routingRationale,
    })
    .from(collabSchema.civicIssue)
    .where(
      scope
        ? sql`${scope} and ${collabSchema.civicIssue.reportCount} > 1`
        : gt(collabSchema.civicIssue.reportCount, 1),
    )
    .orderBy(desc(collabSchema.civicIssue.reportCount))
    .limit(limit);

  if (issues.length === 0) return [];

  return Promise.all(
    issues.map(async (issue) => {
      const links = await db
        .select({
          reportId: collabSchema.issueReport.reportId,
          matchStatus: collabSchema.issueReport.matchStatus,
          similarity: collabSchema.issueReport.similarity,
          title: schema.report.title,
        })
        .from(collabSchema.issueReport)
        .innerJoin(schema.report, eq(schema.report.id, collabSchema.issueReport.reportId))
        .where(eq(collabSchema.issueReport.issueId, issue.id))
        .orderBy(asc(schema.report.createdAt))
        // A worked example is illustrative, not exhaustive; four rows is
        // enough to show the shape without turning the card into a table.
        .limit(4);

      return {
        issueId: issue.id,
        issueCode: issue.issueCode,
        title: issue.title,
        reportCount: issue.reportCount,
        rationale: issue.rationale,
        needsReview: links.filter((link) => link.matchStatus === "needs_review").length,
        reports: links,
      };
    }),
  );
}
