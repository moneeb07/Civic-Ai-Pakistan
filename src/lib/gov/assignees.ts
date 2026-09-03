import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { newId } from "./ids";
import { recordEvent } from "./events";
import { getFirstStage } from "./workflow";
import type { AssigneeDto, OfficerRole } from "./schema";

/*
 * Who is working a complaint.
 *
 * A department head assigns the first person, which is what starts the
 * workflow, and may add more as the problem turns out to need them. Everyone
 * on the list is in the department the complaint was routed to — enforced by
 * looking the officer up scoped to that department, in the query, rather than
 * trusting an id from the request body.
 */

/** The people assigned to one complaint, oldest assignment first. */
export async function listAssignees(assignmentId: string): Promise<AssigneeDto[]> {
  const rows = await db
    .select({
      officerId: govSchema.complaintAssignee.officerId,
      name: schema.user.name,
      role: govSchema.officer.role,
    })
    .from(govSchema.complaintAssignee)
    .innerJoin(govSchema.officer, eq(govSchema.officer.id, govSchema.complaintAssignee.officerId))
    .innerJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(eq(govSchema.complaintAssignee.assignmentId, assignmentId))
    .orderBy(asc(govSchema.complaintAssignee.addedAt));

  return rows.map((row) => ({
    officerId: row.officerId,
    name: row.name,
    role: row.role as OfficerRole,
  }));
}

/** Just the ids — what the authorization rules need. */
export async function listAssigneeIds(assignmentId: string): Promise<string[]> {
  const rows = await db
    .select({ officerId: govSchema.complaintAssignee.officerId })
    .from(govSchema.complaintAssignee)
    .where(eq(govSchema.complaintAssignee.assignmentId, assignmentId));

  return rows.map((row) => row.officerId);
}

/** Assignees for many complaints at once, so a queue page is one query, not one per card. */
export async function assigneesForAssignments(
  assignmentIds: string[],
): Promise<Map<string, AssigneeDto[]>> {
  if (assignmentIds.length === 0) return new Map();

  const rows = await db
    .select({
      assignmentId: govSchema.complaintAssignee.assignmentId,
      officerId: govSchema.complaintAssignee.officerId,
      name: schema.user.name,
      role: govSchema.officer.role,
      addedAt: govSchema.complaintAssignee.addedAt,
    })
    .from(govSchema.complaintAssignee)
    .innerJoin(govSchema.officer, eq(govSchema.officer.id, govSchema.complaintAssignee.officerId))
    .innerJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(inArray(govSchema.complaintAssignee.assignmentId, assignmentIds))
    .orderBy(asc(govSchema.complaintAssignee.addedAt));

  const map = new Map<string, AssigneeDto[]>();
  for (const row of rows) {
    const list = map.get(row.assignmentId) ?? [];
    list.push({ officerId: row.officerId, name: row.name, role: row.role as OfficerRole });
    map.set(row.assignmentId, list);
  }
  return map;
}

export type AddAssigneeResult =
  | { ok: true; startedWorkflow: boolean; stageId: string | null }
  | { error: "no_workflow" | "already_assigned" };

/**
 * Puts one more person on a complaint.
 *
 * The FIRST assignee starts the workflow — that is the moment a named person
 * becomes responsible and the SLA clock should run. Later additions join work
 * already in progress and must not restart it, which is why the stage is only
 * set when there was nobody on it before.
 *
 * Refuses when the department has no saved workflow: a complaint cannot enter
 * a process that does not exist, and inventing one here would apply a process
 * no department head ever reviewed.
 */
export async function addAssignee(input: {
  reportId: string;
  assignmentId: string;
  deptId: string;
  officerId: string;
  byOfficerId: string;
}): Promise<AddAssigneeResult> {
  const existing = await listAssigneeIds(input.assignmentId);
  if (existing.includes(input.officerId)) return { error: "already_assigned" };

  const isFirst = existing.length === 0;
  let stageId: string | null = null;

  if (isFirst) {
    const firstStage = await getFirstStage(input.deptId);
    if (!firstStage) return { error: "no_workflow" };
    stageId = firstStage.id;
  }

  await db.transaction(async (tx) => {
    await tx.insert(govSchema.complaintAssignee).values({
      id: newId(),
      assignmentId: input.assignmentId,
      officerId: input.officerId,
      addedByOfficerId: input.byOfficerId,
    });

    if (isFirst && stageId) {
      await tx
        .update(govSchema.complaintAssignment)
        .set({ currentStageId: stageId, updatedAt: new Date() })
        .where(eq(govSchema.complaintAssignment.id, input.assignmentId));

      await tx.insert(govSchema.complaintStageProgress).values({
        id: newId(),
        assignmentId: input.assignmentId,
        stageId,
        enteredAt: new Date(),
      });
    } else {
      await tx
        .update(govSchema.complaintAssignment)
        .set({ updatedAt: new Date() })
        .where(eq(govSchema.complaintAssignment.id, input.assignmentId));
    }

    await recordEvent(
      {
        reportId: input.reportId,
        actorOfficerId: input.byOfficerId,
        // The first assignment is the one that starts the process; later ones
        // are reinforcements. The timeline should read differently for each.
        eventType: isFirst ? "assigned_to_member" : "assignee_added",
        metadata: { officerId: input.officerId, startedWorkflow: isFirst },
      },
      tx,
    );
  });

  return { ok: true, startedWorkflow: isFirst, stageId };
}

export type RemoveAssigneeResult =
  | { ok: true }
  | { error: "not_assigned" | "last_assignee" };

/**
 * Takes someone off a complaint.
 *
 * Refuses to remove the last remaining assignee once the workflow has started.
 * A complaint mid-process with nobody on it is invisible work: it would sit at
 * a stage no one is responsible for, still counting against its SLA, and it
 * would drop out of every member's queue while still looking assigned to the
 * department head. Reassign first, or reopen it to the queue.
 */
export async function removeAssignee(input: {
  reportId: string;
  assignmentId: string;
  officerId: string;
  byOfficerId: string;
}): Promise<RemoveAssigneeResult> {
  const existing = await listAssigneeIds(input.assignmentId);
  if (!existing.includes(input.officerId)) return { error: "not_assigned" };
  if (existing.length === 1) return { error: "last_assignee" };

  await db.transaction(async (tx) => {
    await tx
      .delete(govSchema.complaintAssignee)
      .where(
        and(
          eq(govSchema.complaintAssignee.assignmentId, input.assignmentId),
          eq(govSchema.complaintAssignee.officerId, input.officerId),
        ),
      );

    await tx
      .update(govSchema.complaintAssignment)
      .set({ updatedAt: new Date() })
      .where(eq(govSchema.complaintAssignment.id, input.assignmentId));

    await recordEvent(
      {
        reportId: input.reportId,
        actorOfficerId: input.byOfficerId,
        eventType: "assignee_removed",
        metadata: { officerId: input.officerId },
      },
      tx,
    );
  });

  return { ok: true };
}
