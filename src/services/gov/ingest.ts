import "server-only";

import { randomBytes } from "node:crypto";
import { and, asc, eq, gte, isNull, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { collabSchema } from "@/db/gov/collaboration";
import { formatIssueCode } from "@/lib/gov/issue-schema";
import { routeToDepartment, type RoutableDepartment } from "@/lib/gov/ai-routing";
import {
  findBestMatch,
  type IncomingReport,
  type IssueCandidate,
} from "@/lib/gov/ai-similarity";

/*
 * The intake pipeline: citizen report -> grouping -> routing suggestion.
 *
 *   confirmed report
 *        |
 *        v
 *   similarity agent   is this the same real-world problem as an open issue?
 *        |
 *   +----+----+
 *   |         |
 *   v         v
 *  link     open a new issue with a fresh CIV- code
 *              |
 *              v
 *        routing agent   which department declared this category?
 *
 * Two deliberate boundaries with the government hierarchy:
 *
 * 1. This SUGGESTS a department, it does not assign one. The issue carries the
 *    suggestion and the reasoning; an org head still routes it, which is what
 *    creates the `complaint_assignment` and starts the workflow clock. The AI
 *    proposes, a human disposes — and the officer can see why it proposed.
 *
 * 2. `report` is read-only here, exactly as it is everywhere else on the
 *    government side. A report becomes government work by gaining links and an
 *    assignment, never by having the citizen's own record mutated.
 *
 * Implemented as a PULL rather than a hook inside the citizen's confirm route,
 * so a report that arrives while this side is down is picked up on the next
 * pass rather than lost.
 */

function newId(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Creates an issue, allocating the next free `CIV-<ORG>-NNNNNN` code.
 *
 * The unique index on `issue_code` is the arbiter, not the counter. Two
 * reports arriving at once can read the same count; the loser's INSERT fails
 * on the constraint and retries with the next number. That keeps codes unique
 * without adding a sequence column to the organization table, which belongs to
 * the hierarchy side.
 */
async function createIssueWithCode(
  org: { id: string; code: string },
  values: Omit<typeof collabSchema.civicIssue.$inferInsert, "issueCode" | "orgId">,
  attempts = 6,
): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(collabSchema.civicIssue)
      .where(eq(collabSchema.civicIssue.orgId, org.id));

    const issueCode = formatIssueCode(org.code, count + 1 + attempt);

    try {
      await db
        .insert(collabSchema.civicIssue)
        .values({ ...values, issueCode, orgId: org.id });
      return issueCode;
    } catch {
      // Almost certainly the unique index: somebody took this number first.
      continue;
    }
  }
  return null;
}

/** Everything a report says, as one blob for the similarity agent. */
function reportText(row: {
  title: string | null;
  description: string | null;
  transcript: string | null;
}): string {
  return [row.title, row.description, row.transcript].filter(Boolean).join(" ");
}

/**
 * Every department in the system, with the organization that owns it.
 *
 * Routing looks across ALL organizations rather than assuming one: whichever
 * department declares the category brings its own organization with it, so the
 * destination org is a consequence of the routing rather than an assumption
 * made before it. Nothing here knows the name of any particular body.
 *
 * `handlesCategories` is a native Postgres text[], so unlike the previous
 * JSON-in-text encoding there is nothing to parse or fail to parse.
 */
async function routableDepartments(): Promise<
  (RoutableDepartment & { orgId: string })[]
> {
  const rows = await db
    .select({
      id: govSchema.department.id,
      name: govSchema.department.name,
      orgId: govSchema.department.orgId,
      categories: govSchema.department.handlesCategories,
    })
    .from(govSchema.department);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    orgId: row.orgId,
    categories: row.categories ?? [],
  }));
}

/**
 * Open issues a report could plausibly belong to.
 *
 * Issues already resolved by their department are excluded: a new report about
 * a problem marked fixed is not more evidence for the old issue, it is a sign
 * the problem came back — and that deserves its own issue rather than being
 * buried in a closed one.
 */
async function candidateIssues(since: Date): Promise<IssueCandidate[]> {
  const rows = await db
    .select({
      id: collabSchema.civicIssue.id,
      category: collabSchema.civicIssue.category,
      title: collabSchema.civicIssue.title,
      description: collabSchema.civicIssue.description,
      latitude: collabSchema.civicIssue.latitude,
      longitude: collabSchema.civicIssue.longitude,
      createdAt: collabSchema.civicIssue.createdAt,
      terminal: govSchema.deptWorkflowStage.isTerminal,
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
    .where(gte(collabSchema.civicIssue.createdAt, since));

  return rows
    .filter((row) => row.terminal !== true)
    .map((row) => ({
      id: row.id,
      category: row.category,
      latitude: row.latitude,
      longitude: row.longitude,
      text: [row.title, row.description].filter(Boolean).join(" "),
      createdAt: row.createdAt,
    }));
}

export interface IngestOutcome {
  reportId: string;
  issueId: string;
  issueCode: string;
  created: boolean;
  matchStatus: string;
  similarity: number | null;
}

/** How far back the similarity agent looks for an open issue to join. */
const CANDIDATE_WINDOW_DAYS = 21;

/** Processes one confirmed report into the issue graph. */
export async function ingestReport(reportId: string): Promise<IngestOutcome | null> {
  const [row] = await db
    .select()
    .from(schema.report)
    .where(eq(schema.report.id, reportId))
    .limit(1);

  if (!row || !row.category) return null;

  const incoming: IncomingReport = {
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    text: reportText(row),
    createdAt: row.createdAt,
  };

  const since = new Date(
    row.createdAt.getTime() - CANDIDATE_WINDOW_DAYS * 24 * 3_600_000,
  );
  const match = findBestMatch(incoming, await candidateIssues(since));

  // -- Joins an existing issue ---------------------------------------------
  if (match) {
    const [existing] = await db
      .select({
        id: collabSchema.civicIssue.id,
        issueCode: collabSchema.civicIssue.issueCode,
      })
      .from(collabSchema.civicIssue)
      .where(eq(collabSchema.civicIssue.id, match.candidate.id))
      .limit(1);

    if (existing) {
      /*
       * "group" stands on its own; "review" is attached provisionally and
       * flagged, so an officer sees an unconfirmed link and can split it back
       * out. Nothing is merged silently.
       */
      const matchStatus =
        match.result.decision === "group" ? "auto_grouped" : "needs_review";

      await db.insert(collabSchema.issueReport).values({
        id: newId(),
        issueId: existing.id,
        reportId: row.id,
        similarity: match.result.score,
        matchStatus,
        matchRationale: match.result.rationale,
      });

      await db
        .update(collabSchema.civicIssue)
        .set({
          reportCount: sql`${collabSchema.civicIssue.reportCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(collabSchema.civicIssue.id, existing.id));

      return {
        reportId: row.id,
        issueId: existing.id,
        issueCode: existing.issueCode,
        created: false,
        matchStatus,
        similarity: match.result.score,
      };
    }
  }

  // -- Opens a new issue ----------------------------------------------------
  const departments = await routableDepartments();
  const routing = routeToDepartment(row.category, departments);

  const routedOrgId = routing.departmentId
    ? (departments.find((d) => d.id === routing.departmentId)?.orgId ?? null)
    : null;

  /*
   * Nothing claimed the category. The report still becomes an issue — it is
   * real, and a citizen filed it — but it lands unrouted for a platform admin
   * to place. Dropping it, or attaching it to an arbitrary department, would
   * both be worse.
   */
  const [fallbackOrg] = await db
    .select({ id: govSchema.organization.id, code: govSchema.organization.code })
    .from(govSchema.organization)
    .orderBy(asc(govSchema.organization.createdAt))
    .limit(1);

  const org = routedOrgId
    ? await db
        .select({ id: govSchema.organization.id, code: govSchema.organization.code })
        .from(govSchema.organization)
        .where(eq(govSchema.organization.id, routedOrgId))
        .limit(1)
        .then((r) => r[0] ?? fallbackOrg)
    : fallbackOrg;

  if (!org) return null;

  const issueId = newId();
  const now = new Date();

  const issueCode = await createIssueWithCode(org, {
    id: issueId,
    // The AI's suggestion, not an assignment: an org head still routes it,
    // which is what creates the assignment and starts the workflow.
    deptId: routing.departmentId,
    category: row.category,
    title: row.title ?? "Reported civic issue",
    description: row.description,
    severity: row.severity,
    latitude: row.latitude,
    longitude: row.longitude,
    locationLabel: row.locationLabel,
    reportCount: 1,
    routingConfidence: routing.confidence,
    routingRationale: routing.rationale,
    routingSource: routing.source,
    createdAt: row.createdAt,
    updatedAt: now,
  });

  if (!issueCode) return null;

  await db.insert(collabSchema.issueReport).values({
    id: newId(),
    issueId,
    reportId: row.id,
    similarity: null,
    matchStatus: "first_report",
    matchRationale: "First report of this problem.",
  });

  return {
    reportId: row.id,
    issueId,
    issueCode,
    created: true,
    matchStatus: "first_report",
    similarity: null,
  };
}

/**
 * Processes every confirmed report that is not yet part of an issue.
 *
 * OLDEST FIRST, which matters: the first report processed becomes the issue's
 * anchor — its coordinates, title and wording are what later reports are
 * compared against. Newest-first would anchor on the most recent arrival, so a
 * late vague report ("something wrong with the road here") becomes the
 * reference and the precise reports before it all score as distant misses.
 */
export async function ingestPendingReports(limit = 200): Promise<IngestOutcome[]> {
  const linked = await db
    .select({ reportId: collabSchema.issueReport.reportId })
    .from(collabSchema.issueReport);
  const linkedIds = linked.map((r) => r.reportId);

  const pending = await db
    .select({ id: schema.report.id })
    .from(schema.report)
    .where(
      and(
        eq(schema.report.status, "ready_for_submission"),
        linkedIds.length > 0 ? notInArray(schema.report.id, linkedIds) : undefined,
      ),
    )
    .orderBy(asc(schema.report.createdAt))
    .limit(limit);

  const outcomes: IngestOutcome[] = [];
  for (const row of pending) {
    const outcome = await ingestReport(row.id);
    if (outcome) outcomes.push(outcome);
  }
  return outcomes;
}

/** Issues no department has claimed yet — surfaced to admins, never hidden. */
export async function countUnroutedIssues(): Promise<number> {
  const rows = await db
    .select({ id: collabSchema.civicIssue.id })
    .from(collabSchema.civicIssue)
    .where(isNull(collabSchema.civicIssue.deptId));
  return rows.length;
}
