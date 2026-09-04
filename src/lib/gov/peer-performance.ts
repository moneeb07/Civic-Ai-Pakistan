import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { collabSchema } from "@/db/gov/collaboration";
import { rankRows, type RankedFields } from "./ranking";
import type { OfficerDto } from "./schema";

/*
 * "How is everyone one level below me doing?"
 *
 * Every officer manages a tier, and the honest question at each tier is the
 * same one asked of different rows:
 *
 *   platform_admin -> which ORGANISATION is doing better
 *   org_head       -> which DEPARTMENT is doing better
 *   dept_head      -> which MEMBER is doing better
 *   member         -> nobody; a member manages no one, so there is no table
 *
 * Deliberately one function rather than three screens' worth of bespoke
 * queries: the comparison is the same comparison, and the ranking is the
 * shared one in ./ranking.ts, so a department cannot place differently here
 * than it does on the analytics page.
 *
 * A note on ranking people. Members are ranked on the same resolution-rate
 * basis as organisations, and that is a genuinely weaker measure for an
 * individual: caseloads differ, a hard complaint takes longer than an easy
 * one, and nothing here knows the difference. So the member table carries a
 * lower evidence bar AND the UI is expected to present it as workload
 * information rather than a staff performance verdict. It is a prompt to ask
 * why, not an answer.
 */

export type PeerLevel = "organization" | "department" | "member" | "none";

export interface PeerInput {
  id: string;
  name: string;
  /** Org code, department category count, or a member's email. */
  subtitle: string | null;
  reported: number;
  inProcess: number;
  resolved: number;
  /** Citizen submissions behind those issues — the workload actually carried. */
  citizenReports: number;
}

export type PeerRow = PeerInput & RankedFields;

export interface PeerPerformance {
  level: PeerLevel;
  /** What the rows are, for the heading: "Organisations", "Departments"… */
  label: string;
  rows: PeerRow[];
}

/*
 * The evidence bar, per level.
 *
 * Ten issues is a fair floor for a whole organisation and an absurd one for a
 * single officer, who may carry a handful at a time — set it there and every
 * member is permanently "not enough data", which makes the table useless. The
 * maths is identical at every level; only the threshold moves.
 */
const MIN_TO_RANK: Record<Exclude<PeerLevel, "none">, number> = {
  organization: 10,
  department: 5,
  member: 3,
};

/** Issue rows with their resolution state, aggregated per owner key. */
function fold(
  rows: { key: string; name: string; subtitle: string | null; reportCount: number; isTerminal: boolean | null; hasAssignment: boolean }[],
): PeerInput[] {
  const byKey = new Map<string, PeerInput>();

  for (const row of rows) {
    const entry = byKey.get(row.key) ?? {
      id: row.key,
      name: row.name,
      subtitle: row.subtitle,
      reported: 0,
      inProcess: 0,
      resolved: 0,
      citizenReports: 0,
    };

    if (row.isTerminal) entry.resolved += 1;
    else if (row.hasAssignment) entry.inProcess += 1;
    else entry.reported += 1;

    entry.citizenReports += row.reportCount ?? 0;
    byKey.set(row.key, entry);
  }

  return [...byKey.values()];
}

export async function getPeerPerformance(officer: OfficerDto): Promise<PeerPerformance> {
  if (officer.role === "platform_admin") {
    const rows = await db
      .select({
        key: govSchema.organization.id,
        name: govSchema.organization.name,
        subtitle: govSchema.organization.code,
        reportCount: collabSchema.civicIssue.reportCount,
        isTerminal: govSchema.deptWorkflowStage.isTerminal,
        assignmentId: govSchema.complaintAssignment.id,
      })
      .from(collabSchema.civicIssue)
      .innerJoin(
        govSchema.organization,
        eq(govSchema.organization.id, collabSchema.civicIssue.orgId),
      )
      .leftJoin(
        govSchema.complaintAssignment,
        eq(govSchema.complaintAssignment.issueId, collabSchema.civicIssue.id),
      )
      .leftJoin(
        govSchema.deptWorkflowStage,
        eq(govSchema.deptWorkflowStage.id, govSchema.complaintAssignment.currentStageId),
      )
      .orderBy(asc(govSchema.organization.name));

    return {
      level: "organization",
      label: "Organisations",
      rows: rankRows(
        fold(rows.map((r) => ({ ...r, hasAssignment: r.assignmentId !== null }))),
        MIN_TO_RANK.organization,
      ),
    };
  }

  if (officer.role === "org_head") {
    if (!officer.orgId) return { level: "none", label: "", rows: [] };

    const rows = await db
      .select({
        key: govSchema.department.id,
        name: govSchema.department.name,
        subtitle: sql<string | null>`null`,
        reportCount: collabSchema.civicIssue.reportCount,
        isTerminal: govSchema.deptWorkflowStage.isTerminal,
        assignmentId: govSchema.complaintAssignment.id,
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
      .where(eq(collabSchema.civicIssue.orgId, officer.orgId))
      .orderBy(asc(govSchema.department.name));

    return {
      level: "department",
      label: "Departments",
      rows: rankRows(
        fold(rows.map((r) => ({ ...r, hasAssignment: r.assignmentId !== null }))),
        MIN_TO_RANK.department,
      ),
    };
  }

  if (officer.role === "dept_head") {
    if (!officer.deptId) return { level: "none", label: "", rows: [] };

    /*
     * Keyed on the ASSIGNED officer, so this counts what each member is
     * actually carrying. Issues in the department that nobody has been
     * assigned yet belong to no member and are excluded by the inner join —
     * they are the dept head's own routing backlog, not a member's record.
     */
    const rows = await db
      .select({
        key: govSchema.officer.id,
        name: schema.user.name,
        subtitle: schema.user.email,
        reportCount: collabSchema.civicIssue.reportCount,
        isTerminal: govSchema.deptWorkflowStage.isTerminal,
        assignmentId: govSchema.complaintAssignment.id,
      })
      .from(collabSchema.civicIssue)
      .innerJoin(
        govSchema.complaintAssignment,
        eq(govSchema.complaintAssignment.issueId, collabSchema.civicIssue.id),
      )
      .innerJoin(
        govSchema.officer,
        eq(govSchema.officer.id, govSchema.complaintAssignment.assignedOfficerId),
      )
      .innerJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
      .leftJoin(
        govSchema.deptWorkflowStage,
        eq(govSchema.deptWorkflowStage.id, govSchema.complaintAssignment.currentStageId),
      )
      .where(eq(collabSchema.civicIssue.deptId, officer.deptId))
      .orderBy(asc(schema.user.name));

    return {
      level: "member",
      label: "Members",
      rows: rankRows(
        fold(rows.map((r) => ({ ...r, hasAssignment: true }))),
        MIN_TO_RANK.member,
      ),
    };
  }

  // A member manages nobody, so there is no peer table to show them.
  return { level: "none", label: "", rows: [] };
}
