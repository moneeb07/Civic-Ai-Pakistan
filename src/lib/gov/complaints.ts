import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { newId } from "./ids";
import { recordEvent } from "./events";
import { notifyCitizenOfResolution } from "./citizen-notify";
import { getFirstStage, getNextStage, getStageById, getWorkflowIdForStage } from "./workflow";
import { canViewComplaint, type AssignmentScope } from "./authorize";
import {
  LOW_RATING_THRESHOLD,
  type ComplaintDto,
  type OfficerDto,
  type StageProgressDto,
  type Severity,
} from "./schema";

/*
 * Complaints, as the government side sees them.
 *
 * The one rule that governs this whole file: `report` is read-only here. The
 * citizen side owns that table, and a complaint becomes government work by
 * gaining a `complaint_assignment` row, never by having its report mutated.
 * A grep for `update(schema.report` in this directory must return nothing.
 *
 * The queue's input is `report.status = 'ready_for_submission'` — the status
 * the citizen's own confirm step sets, and the seam the citizen-side
 * architecture already documented as "future work" for routing.
 */

const READY_STATUS = "ready_for_submission";

/** The columns of `report` the government side is allowed to see. Never the citizen's identity. */
const reportColumns = {
  reportId: schema.report.id,
  title: schema.report.title,
  description: schema.report.description,
  category: schema.report.category,
  severity: schema.report.severity,
  locationLabel: schema.report.locationLabel,
  latitude: schema.report.latitude,
  longitude: schema.report.longitude,
  submittedAt: schema.report.updatedAt,
};

interface AssignmentJoin {
  assignmentId: string | null;
  orgId: string | null;
  deptId: string | null;
  deptName: string | null;
  currentStageId: string | null;
  currentStageName: string | null;
  currentStageTerminal: boolean | null;
  currentStageSla: number | null;
  assignedOfficerId: string | null;
  assignedOfficerName: string | null;
  aiSuggestedDeptId: string | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
  aiSuggestionSource: string | null;
}

function toComplaintDto(
  row: {
    reportId: string;
    title: string | null;
    description: string | null;
    category: string | null;
    severity: string | null;
    locationLabel: string | null;
    latitude: number | null;
    longitude: number | null;
    submittedAt: Date;
  } & AssignmentJoin & {
      ratingStars: number | null;
      ratingComment: string | null;
      ratedAt: Date | null;
      stageEnteredAt: Date | null;
    },
): ComplaintDto {
  const rating =
    row.ratingStars !== null && row.ratedAt !== null
      ? { stars: row.ratingStars, comment: row.ratingComment, ratedAt: row.ratedAt.toISOString() }
      : null;

  return {
    reportId: row.reportId,
    title: row.title,
    description: row.description,
    category: row.category,
    severity: (row.severity as Severity | null) ?? null,
    locationLabel: row.locationLabel,
    latitude: row.latitude,
    longitude: row.longitude,
    submittedAt: row.submittedAt.toISOString(),
    assignment:
      row.assignmentId && row.orgId && row.deptId
        ? {
            id: row.assignmentId,
            orgId: row.orgId,
            deptId: row.deptId,
            deptName: row.deptName ?? "",
            currentStageId: row.currentStageId,
            currentStageName: row.currentStageName,
            assignedOfficerId: row.assignedOfficerId,
            assignedOfficerName: row.assignedOfficerName,
            aiSuggestedDeptId: row.aiSuggestedDeptId,
            aiConfidence: row.aiConfidence,
            aiReasoning: row.aiReasoning,
            aiSuggestionSource: row.aiSuggestionSource ?? "ai",
            isResolved: row.currentStageTerminal === true,
            stageEnteredAt: row.stageEnteredAt ? row.stageEnteredAt.toISOString() : null,
            slaHours: row.currentStageSla,
          }
        : null,
    // A low rating is a flag for the dept head to look again, never an
    // automatic reopen — see §6.3. The decision stays with a person.
    needsAttention: rating !== null && rating.stars <= LOW_RATING_THRESHOLD,
    rating,
  };
}

/*
 * The joins every complaint read shares.
 *
 * Written once because the alternative — each query assembling its own — is
 * how two code paths end up disagreeing about whether a complaint is
 * resolved. `stageEnteredAt` comes from the open progress row, which is the
 * one with no completedAt.
 */
function complaintSelect() {
  return db
    .select({
      ...reportColumns,
      assignmentId: govSchema.complaintAssignment.id,
      orgId: govSchema.complaintAssignment.orgId,
      deptId: govSchema.complaintAssignment.deptId,
      deptName: govSchema.department.name,
      currentStageId: govSchema.complaintAssignment.currentStageId,
      currentStageName: govSchema.deptWorkflowStage.name,
      currentStageTerminal: govSchema.deptWorkflowStage.isTerminal,
      currentStageSla: govSchema.deptWorkflowStage.slaHours,
      assignedOfficerId: govSchema.complaintAssignment.assignedOfficerId,
      assignedOfficerName: schema.user.name,
      aiSuggestedDeptId: govSchema.complaintAssignment.aiSuggestedDeptId,
      aiConfidence: govSchema.complaintAssignment.aiConfidence,
      aiReasoning: govSchema.complaintAssignment.aiReasoning,
      aiSuggestionSource: govSchema.complaintAssignment.aiSuggestionSource,
      ratingStars: govSchema.complaintRating.stars,
      ratingComment: govSchema.complaintRating.comment,
      ratedAt: govSchema.complaintRating.ratedAt,
      stageEnteredAt: govSchema.complaintStageProgress.enteredAt,
    })
    .from(schema.report)
    .leftJoin(
      govSchema.complaintAssignment,
      eq(govSchema.complaintAssignment.reportId, schema.report.id),
    )
    .leftJoin(govSchema.department, eq(govSchema.department.id, govSchema.complaintAssignment.deptId))
    .leftJoin(
      govSchema.deptWorkflowStage,
      eq(govSchema.deptWorkflowStage.id, govSchema.complaintAssignment.currentStageId),
    )
    .leftJoin(
      govSchema.officer,
      eq(govSchema.officer.id, govSchema.complaintAssignment.assignedOfficerId),
    )
    .leftJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .leftJoin(govSchema.complaintRating, eq(govSchema.complaintRating.reportId, schema.report.id))
    .leftJoin(
      govSchema.complaintStageProgress,
      and(
        eq(govSchema.complaintStageProgress.assignmentId, govSchema.complaintAssignment.id),
        isNull(govSchema.complaintStageProgress.completedAt),
      ),
    );
}

/**
 * Confirmed complaints not yet routed to any department — the organization
 * head's inbox.
 *
 * Scoped by status in SQL. A report the citizen has not confirmed is not
 * visible to the government side at all.
 */
export async function listUnroutedComplaints(): Promise<ComplaintDto[]> {
  const rows = await complaintSelect()
    .where(
      and(eq(schema.report.status, READY_STATUS), isNull(govSchema.complaintAssignment.id)),
    )
    .orderBy(desc(schema.report.updatedAt));

  return rows.map(toComplaintDto);
}

/**
 * Everything routed into one department.
 *
 * `deptId` is in the WHERE clause, so a dept head asking for another
 * department's queue receives an empty list rather than a filtered one.
 */
export async function listDepartmentComplaints(deptId: string): Promise<ComplaintDto[]> {
  const rows = await complaintSelect()
    .where(eq(govSchema.complaintAssignment.deptId, deptId))
    .orderBy(desc(schema.report.updatedAt));

  return rows.map(toComplaintDto);
}

/** One member's own caseload. Both the department and the assignee are in the WHERE clause. */
export async function listMemberComplaints(
  deptId: string,
  officerId: string,
): Promise<ComplaintDto[]> {
  const rows = await complaintSelect()
    .where(
      and(
        eq(govSchema.complaintAssignment.deptId, deptId),
        eq(govSchema.complaintAssignment.assignedOfficerId, officerId),
      ),
    )
    .orderBy(desc(schema.report.updatedAt));

  return rows.map(toComplaintDto);
}

/** Everything routed anywhere in one organization — the org head's overview. */
export async function listOrganizationComplaints(orgId: string): Promise<ComplaintDto[]> {
  const rows = await complaintSelect()
    .where(eq(govSchema.complaintAssignment.orgId, orgId))
    .orderBy(desc(schema.report.updatedAt));

  return rows.map(toComplaintDto);
}

/**
 * One complaint, or null.
 *
 * Deliberately returns null for "does not exist" and for "exists but you may
 * not see it" alike — the caller turns both into a 404, so the government
 * side never confirms that a complaint id is real to someone outside its
 * scope. This mirrors getOwnedReport() on the citizen side exactly.
 */
export async function getComplaintForOfficer(
  reportId: string,
  officer: OfficerDto,
): Promise<ComplaintDto | null> {
  const rows = await complaintSelect().where(eq(schema.report.id, reportId)).limit(1);
  const row = rows[0];
  if (!row) return null;

  const dto = toComplaintDto(row);

  // An unrouted complaint is only visible to whoever may route it.
  if (!dto.assignment) {
    return officer.role === "platform_admin" || officer.role === "org_head" ? dto : null;
  }

  const scope: AssignmentScope = {
    orgId: dto.assignment.orgId,
    deptId: dto.assignment.deptId,
    assignedOfficerId: dto.assignment.assignedOfficerId,
  };

  return canViewComplaint(officer, scope) ? dto : null;
}

/** The scope facts for an authorization check, without loading the whole complaint. */
export async function getAssignmentScope(reportId: string): Promise<
  (AssignmentScope & { id: string; currentStageId: string | null }) | null
> {
  const [row] = await db
    .select({
      id: govSchema.complaintAssignment.id,
      orgId: govSchema.complaintAssignment.orgId,
      deptId: govSchema.complaintAssignment.deptId,
      assignedOfficerId: govSchema.complaintAssignment.assignedOfficerId,
      currentStageId: govSchema.complaintAssignment.currentStageId,
    })
    .from(govSchema.complaintAssignment)
    .where(eq(govSchema.complaintAssignment.reportId, reportId))
    .limit(1);

  return row ?? null;
}

// -- Routing ---------------------------------------------------------------------

/**
 * Routes a confirmed complaint into a department.
 *
 * `aiSuggestionSource` follows the citizen side's `*_source` convention: it
 * stays "ai" only when the officer accepted a suggestion a model actually
 * made, and flips to "manual" the moment a human picks the destination. With
 * the routing service not yet built there is never an AI suggestion, so every
 * route today is honestly "manual".
 */
export async function routeComplaint(input: {
  reportId: string;
  orgId: string;
  deptId: string;
  officerId: string;
  acceptedAiSuggestion: boolean;
}): Promise<{ ok: true; assignmentId: string } | { error: "not_ready" | "already_routed" }> {
  const [reportRow] = await db
    .select({ id: schema.report.id, status: schema.report.status })
    .from(schema.report)
    .where(and(eq(schema.report.id, input.reportId), eq(schema.report.status, READY_STATUS)))
    .limit(1);

  if (!reportRow) return { error: "not_ready" };

  const existing = await getAssignmentScope(input.reportId);
  if (existing) return { error: "already_routed" };

  const assignmentId = newId();
  const hadAiSuggestion = false;

  await db.transaction(async (tx) => {
    await tx.insert(govSchema.complaintAssignment).values({
      id: assignmentId,
      reportId: input.reportId,
      orgId: input.orgId,
      deptId: input.deptId,
      // Null until a dept head assigns it — routing decides *where*, assignment
      // decides *who*, and only assignment starts the workflow clock.
      currentStageId: null,
      assignedOfficerId: null,
      aiSuggestionSource: input.acceptedAiSuggestion && hadAiSuggestion ? "ai" : "manual",
    });

    await recordEvent(
      {
        reportId: input.reportId,
        actorOfficerId: input.officerId,
        eventType: input.acceptedAiSuggestion && hadAiSuggestion ? "org_approved" : "org_overrode",
        metadata: { deptId: input.deptId, hadAiSuggestion },
      },
      tx,
    );
  });

  return { ok: true, assignmentId };
}

// -- Assignment --------------------------------------------------------------------

/**
 * Hands a routed complaint to a specific member and starts the workflow.
 *
 * Refuses when the department has not saved a workflow: a complaint cannot
 * enter a process that does not exist, and inventing a default here would
 * apply a process no dept head ever reviewed.
 */
export async function assignComplaint(input: {
  reportId: string;
  assignmentId: string;
  deptId: string;
  toOfficerId: string;
  byOfficerId: string;
}): Promise<{ ok: true; stageId: string } | { error: "no_workflow" }> {
  const firstStage = await getFirstStage(input.deptId);
  if (!firstStage) return { error: "no_workflow" };

  await db.transaction(async (tx) => {
    await tx
      .update(govSchema.complaintAssignment)
      .set({
        assignedOfficerId: input.toOfficerId,
        currentStageId: firstStage.id,
        updatedAt: new Date(),
      })
      .where(eq(govSchema.complaintAssignment.id, input.assignmentId));

    await tx.insert(govSchema.complaintStageProgress).values({
      id: newId(),
      assignmentId: input.assignmentId,
      stageId: firstStage.id,
      enteredAt: new Date(),
    });

    await recordEvent(
      {
        reportId: input.reportId,
        actorOfficerId: input.byOfficerId,
        eventType: "assigned_to_member",
        metadata: { toOfficerId: input.toOfficerId, stageId: firstStage.id },
      },
      tx,
    );
  });

  return { ok: true, stageId: firstStage.id };
}

// -- Stage advance ------------------------------------------------------------------

export type AdvanceResult =
  | { ok: true; resolved: boolean; nextStageId: string | null }
  | { error: "not_started" | "already_resolved" | "stage_missing"; missing?: ("photo" | "note")[] }
  | { error: "requirements_unmet"; missing: ("photo" | "note")[] };

/**
 * Moves a complaint to the next stage in its department's workflow.
 *
 * The stage's own `requiresPhoto` / `requiresNote` flags are enforced here,
 * server-side, before anything is written — the client disables the button
 * too, but a disabled button is a convenience, not a control. A stage that
 * demands photographic evidence does not get advanced without it.
 *
 * Reaching the terminal stage closes the complaint and notifies the citizen.
 * Per the product decision, there is no citizen verification gate: resolution
 * is the department's call, and the citizen is told, not asked.
 */
export async function advanceStage(input: {
  reportId: string;
  assignmentId: string;
  officerId: string;
  photoUrl: string | null;
  note: string | null;
}): Promise<AdvanceResult> {
  const scope = await getAssignmentScope(input.reportId);
  if (!scope || !scope.currentStageId) return { error: "not_started" };

  const currentStage = await getStageById(scope.currentStageId);
  if (!currentStage) return { error: "stage_missing" };
  if (currentStage.isTerminal) return { error: "already_resolved" };

  const missing: ("photo" | "note")[] = [];
  if (currentStage.requiresPhoto && !input.photoUrl) missing.push("photo");
  if (currentStage.requiresNote && !input.note) missing.push("note");
  if (missing.length > 0) return { error: "requirements_unmet", missing };

  const workflowId = await getWorkflowIdForStage(currentStage.id);
  if (!workflowId) return { error: "stage_missing" };

  const nextStage = await getNextStage(workflowId, currentStage.position);
  if (!nextStage) return { error: "stage_missing" };

  const now = new Date();

  await db.transaction(async (tx) => {
    // Close the open progress row for the stage being left. Scoped by
    // completedAt IS NULL so a replayed request cannot close it twice.
    await tx
      .update(govSchema.complaintStageProgress)
      .set({
        completedAt: now,
        completedByOfficerId: input.officerId,
        photoUrl: input.photoUrl,
        note: input.note,
      })
      .where(
        and(
          eq(govSchema.complaintStageProgress.assignmentId, input.assignmentId),
          eq(govSchema.complaintStageProgress.stageId, currentStage.id),
          isNull(govSchema.complaintStageProgress.completedAt),
        ),
      );

    await tx.insert(govSchema.complaintStageProgress).values({
      id: newId(),
      assignmentId: input.assignmentId,
      stageId: nextStage.id,
      enteredAt: now,
    });

    await tx
      .update(govSchema.complaintAssignment)
      .set({ currentStageId: nextStage.id, updatedAt: now })
      .where(eq(govSchema.complaintAssignment.id, input.assignmentId));

    await recordEvent(
      {
        reportId: input.reportId,
        actorOfficerId: input.officerId,
        eventType: "stage_advanced",
        metadata: { from: currentStage.name, to: nextStage.name, hadPhoto: Boolean(input.photoUrl) },
      },
      tx,
    );

    if (nextStage.isTerminal) {
      await recordEvent(
        {
          reportId: input.reportId,
          actorOfficerId: input.officerId,
          eventType: "resolved",
          metadata: { stageId: nextStage.id },
        },
        tx,
      );

      await notifyCitizenOfResolution(input.reportId, tx);
    }
  });

  return { ok: true, resolved: nextStage.isTerminal, nextStageId: nextStage.id };
}

/**
 * Puts a resolved complaint back at the start of its workflow.
 *
 * A new progress row rather than a reset of the old one: the history of how
 * long the first pass took is evidence, and erasing it would make a reopened
 * complaint indistinguishable from one that was always slow.
 */
export async function reopenComplaint(input: {
  reportId: string;
  assignmentId: string;
  deptId: string;
  officerId: string;
}): Promise<{ ok: true } | { error: "not_resolved" | "no_workflow" }> {
  const scope = await getAssignmentScope(input.reportId);
  if (!scope?.currentStageId) return { error: "not_resolved" };

  const currentStage = await getStageById(scope.currentStageId);
  if (!currentStage?.isTerminal) return { error: "not_resolved" };

  const firstStage = await getFirstStage(input.deptId);
  if (!firstStage) return { error: "no_workflow" };

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(govSchema.complaintStageProgress)
      .set({ completedAt: now, completedByOfficerId: input.officerId })
      .where(
        and(
          eq(govSchema.complaintStageProgress.assignmentId, input.assignmentId),
          eq(govSchema.complaintStageProgress.stageId, currentStage.id),
          isNull(govSchema.complaintStageProgress.completedAt),
        ),
      );

    await tx.insert(govSchema.complaintStageProgress).values({
      id: newId(),
      assignmentId: input.assignmentId,
      stageId: firstStage.id,
      enteredAt: now,
    });

    await tx
      .update(govSchema.complaintAssignment)
      .set({ currentStageId: firstStage.id, updatedAt: now })
      .where(eq(govSchema.complaintAssignment.id, input.assignmentId));

    await recordEvent(
      {
        reportId: input.reportId,
        actorOfficerId: input.officerId,
        eventType: "reopened",
        metadata: { from: currentStage.name, to: firstStage.name },
      },
      tx,
    );
  });

  return { ok: true };
}

// -- Stage history -------------------------------------------------------------------

export async function listStageProgress(assignmentId: string): Promise<StageProgressDto[]> {
  const rows = await db
    .select({
      id: govSchema.complaintStageProgress.id,
      stageId: govSchema.complaintStageProgress.stageId,
      stageName: govSchema.deptWorkflowStage.name,
      enteredAt: govSchema.complaintStageProgress.enteredAt,
      completedAt: govSchema.complaintStageProgress.completedAt,
      photoUrl: govSchema.complaintStageProgress.photoUrl,
      note: govSchema.complaintStageProgress.note,
      completedByOfficerName: schema.user.name,
    })
    .from(govSchema.complaintStageProgress)
    .innerJoin(
      govSchema.deptWorkflowStage,
      eq(govSchema.deptWorkflowStage.id, govSchema.complaintStageProgress.stageId),
    )
    .leftJoin(
      govSchema.officer,
      eq(govSchema.officer.id, govSchema.complaintStageProgress.completedByOfficerId),
    )
    .leftJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(eq(govSchema.complaintStageProgress.assignmentId, assignmentId))
    .orderBy(asc(govSchema.complaintStageProgress.enteredAt));

  return rows.map((row) => ({
    id: row.id,
    stageId: row.stageId,
    stageName: row.stageName,
    enteredAt: row.enteredAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    completedByOfficerName: row.completedByOfficerName,
    photoUrl: row.photoUrl,
    note: row.note,
  }));
}

// -- Citizen rating ---------------------------------------------------------------------

/**
 * Records a citizen's rating of how their complaint was handled.
 *
 * `citizenUserId` is matched against `report.userId` inside the lookup query,
 * so a citizen can only rate their own complaint and the check is a WHERE
 * clause rather than an if-statement. Rating a complaint that is not theirs
 * is indistinguishable from rating one that does not exist.
 */
export async function rateComplaint(input: {
  reportId: string;
  citizenUserId: string;
  stars: number;
  comment: string | null;
}): Promise<{ ok: true } | { error: "not_found" | "not_resolved" | "already_rated" }> {
  const [reportRow] = await db
    .select({ id: schema.report.id })
    .from(schema.report)
    .where(and(eq(schema.report.id, input.reportId), eq(schema.report.userId, input.citizenUserId)))
    .limit(1);

  if (!reportRow) return { error: "not_found" };

  // Only a complaint that actually reached a terminal stage can be rated —
  // there is nothing to rate about work that has not finished.
  const [resolved] = await db
    .select({ id: govSchema.complaintAssignment.id })
    .from(govSchema.complaintAssignment)
    .innerJoin(
      govSchema.deptWorkflowStage,
      eq(govSchema.deptWorkflowStage.id, govSchema.complaintAssignment.currentStageId),
    )
    .where(
      and(
        eq(govSchema.complaintAssignment.reportId, input.reportId),
        eq(govSchema.deptWorkflowStage.isTerminal, true),
      ),
    )
    .limit(1);

  if (!resolved) return { error: "not_resolved" };

  const [existing] = await db
    .select({ id: govSchema.complaintRating.id })
    .from(govSchema.complaintRating)
    .where(eq(govSchema.complaintRating.reportId, input.reportId))
    .limit(1);

  if (existing) return { error: "already_rated" };

  await db.transaction(async (tx) => {
    await tx.insert(govSchema.complaintRating).values({
      id: newId(),
      reportId: input.reportId,
      citizenUserId: input.citizenUserId,
      stars: input.stars,
      comment: input.comment,
    });

    await recordEvent(
      {
        reportId: input.reportId,
        // Null actor: the rating came from a citizen, not an officer, and this
        // log records officer actions. Pretending otherwise would misattribute it.
        actorOfficerId: null,
        eventType: "citizen_rated",
        metadata: { stars: input.stars },
      },
      tx,
    );
  });

  return { ok: true };
}
