import "server-only";

import { randomBytes } from "node:crypto";
import { and, asc, eq, gte, isNull, ne, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { report } from "@/db/schema";
import {
  authority,
  civicIssue,
  department,
  issueReport,
  issueStatusEvent,
} from "@/db/authority/schema";
import { formatIssueCode } from "@/lib/authority/schema";
import {
  parseDepartmentCategories,
  routeToDepartment,
  type RoutableDepartment,
} from "@/lib/authority/routing";
import {
  findBestMatch,
  type IncomingReport,
  type IssueCandidate,
} from "@/lib/authority/similarity";

/*
 * The intake pipeline: citizen report -> routing -> duplicate check -> issue.
 *
 *   confirmed report
 *        |
 *        v
 *   routing agent      which department declared this category?
 *        |
 *        v
 *   similarity agent   is this the same real-world problem as an open issue?
 *        |
 *   +----+----+
 *   |         |
 *   v         v
 *  link     open a new issue with a fresh CIV- code
 *
 * Deliberately implemented as a PULL, not as a hook inside the citizen's
 * confirm route. Stage 3 therefore adds no code to the Stage 1/2 flow at all —
 * the two halves can be merged independently — and a report that arrives while
 * the authority side is down is picked up on the next pass rather than lost.
 * In production this would be a queue worker; the trigger differs, the
 * pipeline does not.
 */

function newId(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Creates an issue, allocating the next free code for its authority.
 *
 * The unique index on `issue_code` is the arbiter, not the counter. Two
 * reports arriving at once can read the same sequence number, and the loser's
 * INSERT then fails on the constraint and retries with the next number — so a
 * code is never issued twice, without needing a lock or a transaction the
 * PGlite/node-postgres split would have to special-case.
 *
 * Returns the code, or null if the authority vanished or the contention was
 * absurd. A null is reported to the caller, never papered over with a
 * duplicate code.
 */
async function createIssueWithCode(
  authorityId: string,
  values: Omit<typeof civicIssue.$inferInsert, "issueCode" | "authorityId">,
  attempts = 6,
): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const [row] = await db
      .select({ code: authority.code, sequence: authority.issueSequence })
      .from(authority)
      .where(eq(authority.id, authorityId))
      .limit(1);

    if (!row) return null;

    const sequence = row.sequence + 1;
    const issueCode = formatIssueCode(row.code, sequence);

    try {
      await db.insert(civicIssue).values({ ...values, issueCode, authorityId });
    } catch {
      // Almost certainly the unique index: someone took this number first.
      // Re-read the counter and try the next one.
      continue;
    }

    await db
      .update(authority)
      .set({ issueSequence: sequence })
      .where(eq(authority.id, authorityId));

    return issueCode;
  }

  return null;
}

/** Everything a report says, as one blob of text for the similarity agent. */
function reportText(row: {
  title: string | null;
  description: string | null;
  transcript: string | null;
}): string {
  return [row.title, row.description, row.transcript].filter(Boolean).join(" ");
}

/**
 * Every active department in the system, with the authority that owns it.
 *
 * Routing looks across ALL authorities, not just one. That is what makes a
 * second authority real rather than decorative: if the Police declare
 * OPEN_MANHOLE and CDA does not, a manhole report goes to the Police, and the
 * authority is a consequence of the routing rather than an assumption made
 * before it. Nothing here knows the name of any particular authority.
 */
async function routableDepartments(): Promise<
  (RoutableDepartment & { authorityId: string })[]
> {
  const rows = await db
    .select({
      id: department.id,
      name: department.name,
      categories: department.categories,
      authorityId: department.authorityId,
    })
    .from(department)
    .where(eq(department.active, true));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    authorityId: row.authorityId,
    categories: parseDepartmentCategories(row.categories),
  }));
}

/**
 * Open issues this report could plausibly belong to.
 *
 * RESOLVED issues are excluded on purpose: a new report about a problem
 * already marked fixed is not more evidence for the old issue, it is a sign
 * the problem came back — and that deserves its own issue and its own
 * REPORTED status rather than being buried in a closed one.
 */
async function candidateIssues(
  authorityId: string,
  since: Date,
): Promise<IssueCandidate[]> {
  const rows = await db
    .select({
      id: civicIssue.id,
      category: civicIssue.category,
      title: civicIssue.title,
      description: civicIssue.description,
      latitude: civicIssue.latitude,
      longitude: civicIssue.longitude,
      createdAt: civicIssue.createdAt,
    })
    .from(civicIssue)
    .where(
      and(
        eq(civicIssue.authorityId, authorityId),
        ne(civicIssue.status, "RESOLVED"),
        gte(civicIssue.createdAt, since),
      ),
    );

  return rows.map((row) => ({
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
  /** Whether this report opened a new issue or joined an existing one. */
  created: boolean;
  matchStatus: string;
  similarity: number | null;
}

/** How far back the similarity agent looks for an open issue to join. */
const CANDIDATE_WINDOW_DAYS = 21;

/**
 * Processes one report into the issue graph.
 *
 * Returns null when the report cannot be placed — no authority configured, or
 * no category to route on. That is reported, not swallowed: an unplaceable
 * report stays unlinked and will be retried, rather than being attached
 * somewhere arbitrary.
 */
export async function ingestReport(reportId: string): Promise<IngestOutcome | null> {
  const [row] = await db.select().from(report).where(eq(report.id, reportId)).limit(1);
  if (!row || !row.category) return null;

  /*
   * The department decides the authority, not the other way round. Routing
   * runs across every configured authority's departments; whichever
   * department claims the category brings its own authority with it.
   */
  const departments = await routableDepartments();
  const routing = routeToDepartment(row.category, departments);

  const routedAuthorityId = routing.departmentId
    ? (departments.find((dept) => dept.id === routing.departmentId)?.authorityId ?? null)
    : null;

  /*
   * Nothing claimed the category. The report still becomes an issue — it is
   * real, and a citizen reported it — but it lands unassigned with the oldest
   * configured authority, where an admin can see and route it. Dropping it, or
   * silently attaching it to an arbitrary department, would both be worse.
   */
  const [fallback] = await db
    .select({ id: authority.id })
    .from(authority)
    .orderBy(authority.createdAt)
    .limit(1);

  const target = { id: routedAuthorityId ?? fallback?.id ?? null };
  if (!target.id) return null;

  const incoming: IncomingReport = {
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    text: reportText(row),
    createdAt: row.createdAt,
  };

  const authorityId = target.id;

  const since = new Date(
    row.createdAt.getTime() - CANDIDATE_WINDOW_DAYS * 24 * 3_600_000,
  );
  const match = findBestMatch(incoming, await candidateIssues(authorityId, since));

  // -- Joins an existing issue ---------------------------------------------
  if (match) {
    const [existing] = await db
      .select({ id: civicIssue.id, issueCode: civicIssue.issueCode })
      .from(civicIssue)
      .where(eq(civicIssue.id, match.candidate.id))
      .limit(1);

    if (existing) {
      /*
       * "group" is confident enough to stand on its own; "review" is grouped
       * provisionally and flagged, so a member sees an unconfirmed link on the
       * workspace and can split it back out. Nothing is merged silently.
       */
      const matchStatus =
        match.result.decision === "group" ? "auto_grouped" : "needs_review";

      await db.insert(issueReport).values({
        id: newId(),
        issueId: existing.id,
        reportId: row.id,
        similarity: match.result.score,
        matchStatus,
        matchRationale: match.result.rationale,
      });

      await db
        .update(civicIssue)
        .set({
          reportCount: sql`${civicIssue.reportCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(civicIssue.id, existing.id));

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
  const issueId = newId();
  const now = new Date();

  const issueCode = await createIssueWithCode(authorityId, {
    id: issueId,
    departmentId: routing.departmentId,
    category: row.category,
    title: row.title ?? "Reported civic issue",
    description: row.description,
    severity: row.severity,
    status: "REPORTED",
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

  await db.insert(issueReport).values({
    id: newId(),
    issueId,
    reportId: row.id,
    similarity: null,
    matchStatus: "first_report",
    matchRationale: "First report of this problem.",
  });

  // The opening entry of the status history, attributed to the system.
  await db.insert(issueStatusEvent).values({
    id: newId(),
    issueId,
    fromStatus: null,
    toStatus: "REPORTED",
    note: routing.rationale,
    memberId: null,
    createdAt: row.createdAt,
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
 * Sequential rather than parallel, deliberately: each report is scored against
 * the issues that already exist, so two reports of the same new pothole in one
 * batch must be handled in order for the second to find the first.
 *
 * OLDEST FIRST, which matters more than it looks. The first report to be
 * processed becomes the issue's anchor — its coordinates, its title, its
 * wording are what every later report is compared against. Processing newest
 * first anchors the issue on the most recent arrival, so a late vague report
 * ("something wrong with the road here") becomes the reference point and the
 * twenty precise reports that came before it all score as distant near-misses.
 * Chronological order is also simply what production sees: reports arrive one
 * at a time, in order.
 */
export async function ingestPendingReports(limit = 50): Promise<IngestOutcome[]> {
  const linked = await db.select({ reportId: issueReport.reportId }).from(issueReport);
  const linkedIds = linked.map((row) => row.reportId);

  const pending = await db
    .select({ id: report.id })
    .from(report)
    .where(
      and(
        eq(report.status, "ready_for_submission"),
        linkedIds.length > 0 ? notInArray(report.id, linkedIds) : undefined,
      ),
    )
    .orderBy(asc(report.createdAt))
    .limit(limit);

  const outcomes: IngestOutcome[] = [];
  for (const row of pending) {
    const outcome = await ingestReport(row.id);
    if (outcome) outcomes.push(outcome);
  }

  return outcomes;
}

/** Reports that could not be placed — surfaced to admins rather than hidden. */
export async function countUnroutedIssues(authorityId: string): Promise<number> {
  const rows = await db
    .select({ id: civicIssue.id })
    .from(civicIssue)
    .where(and(eq(civicIssue.authorityId, authorityId), isNull(civicIssue.departmentId)));

  return rows.length;
}
