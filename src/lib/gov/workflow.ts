import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { govSchema } from "@/db/schema";
import { newId } from "./ids";
import { recordDeptEvent } from "./events";
import {
  DEFAULT_WORKFLOW_STAGES,
  type WorkflowDto,
  type WorkflowStageDto,
  type WorkflowValues,
} from "./schema";

/*
 * Department workflows.
 *
 * A workflow is a strict ordered list of stages. Position 0 is the intake
 * stage a complaint enters when a dept head assigns it, and exactly one stage
 * is terminal — reaching it means resolved, notifies the citizen, and closes
 * the complaint.
 *
 * Order lives in the `position` column, derived from the array index the dept
 * head submitted. The client never sends positions of its own, so the order
 * shown on screen and the order stored can't disagree.
 */

function toStageDto(row: typeof govSchema.deptWorkflowStage.$inferSelect): WorkflowStageDto {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    description: row.description,
    requiresPhoto: row.requiresPhoto,
    requiresNote: row.requiresNote,
    slaHours: row.slaHours,
    isTerminal: row.isTerminal,
  };
}

/**
 * The department's saved workflow, or the seeded default when it has none.
 *
 * The default is returned with `isTemplate: true` and is NOT written to the
 * database. A department that has never been configured must not silently
 * look configured — the dept head reviews and saves it, which is the moment
 * it becomes theirs.
 */
export async function getWorkflow(deptId: string): Promise<WorkflowDto> {
  const [workflow] = await db
    .select()
    .from(govSchema.deptWorkflow)
    .where(eq(govSchema.deptWorkflow.deptId, deptId))
    .limit(1);

  if (!workflow) {
    return {
      id: "",
      deptId,
      isTemplate: true,
      updatedAt: new Date().toISOString(),
      stages: DEFAULT_WORKFLOW_STAGES.map((stage, index) => ({
        id: `template-${index}`,
        position: index,
        name: stage.name,
        description: stage.description ?? null,
        requiresPhoto: stage.requiresPhoto,
        requiresNote: stage.requiresNote,
        slaHours: stage.slaHours ?? null,
        isTerminal: stage.isTerminal,
      })),
    };
  }

  const stages = await db
    .select()
    .from(govSchema.deptWorkflowStage)
    .where(eq(govSchema.deptWorkflowStage.workflowId, workflow.id))
    .orderBy(asc(govSchema.deptWorkflowStage.position));

  return {
    id: workflow.id,
    deptId: workflow.deptId,
    isTemplate: false,
    updatedAt: workflow.updatedAt.toISOString(),
    stages: stages.map(toStageDto),
  };
}

/**
 * Replaces a department's workflow atomically.
 *
 * Delete-then-insert inside one transaction rather than a diff: the unique
 * (workflowId, position) index means an in-place reorder would collide with
 * itself part-way through, and a half-applied workflow is worse than a slower
 * write. Stage ids are regenerated, which is why in-flight complaints are
 * re-pointed below.
 */
export async function saveWorkflow(input: {
  deptId: string;
  officerId: string;
  values: WorkflowValues;
}): Promise<WorkflowDto> {
  const { deptId, officerId, values } = input;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(govSchema.deptWorkflow)
      .where(eq(govSchema.deptWorkflow.deptId, deptId))
      .limit(1);

    let workflowId: string;

    if (existing) {
      workflowId = existing.id;
      await tx
        .update(govSchema.deptWorkflow)
        .set({ updatedAt: new Date(), updatedByOfficerId: officerId })
        .where(eq(govSchema.deptWorkflow.id, workflowId));

      /*
       * Stages are deleted and re-created, and complaint_stage_progress
       * cascades from stage_id. Re-pointing in-flight complaints is therefore
       * a later ticket's problem only if a workflow is edited mid-flight;
       * for now the assignment's currentStageId is nulled by the FK's
       * ON DELETE SET NULL and the complaint returns to the dept head's
       * queue to be re-assigned, rather than pointing at a stage that no
       * longer exists.
       */
      await tx
        .delete(govSchema.deptWorkflowStage)
        .where(eq(govSchema.deptWorkflowStage.workflowId, workflowId));
    } else {
      workflowId = newId();
      await tx.insert(govSchema.deptWorkflow).values({
        id: workflowId,
        deptId,
        updatedByOfficerId: officerId,
      });
    }

    await tx.insert(govSchema.deptWorkflowStage).values(
      values.stages.map((stage, index) => ({
        id: newId(),
        workflowId,
        position: index,
        name: stage.name,
        description: stage.description ?? null,
        requiresPhoto: stage.requiresPhoto,
        requiresNote: stage.requiresNote,
        slaHours: stage.slaHours ?? null,
        isTerminal: stage.isTerminal,
      })),
    );
  });

  await recordDeptEvent({
    deptId,
    actorOfficerId: officerId,
    eventType: "workflow_updated",
    metadata: { stageCount: values.stages.length, stageNames: values.stages.map((s) => s.name) },
  });

  return getWorkflow(deptId);
}

/** The stage a complaint enters on assignment. Null when the department has not saved a workflow yet. */
export async function getFirstStage(deptId: string): Promise<WorkflowStageDto | null> {
  const [row] = await db
    .select({ stage: govSchema.deptWorkflowStage })
    .from(govSchema.deptWorkflow)
    .innerJoin(
      govSchema.deptWorkflowStage,
      eq(govSchema.deptWorkflowStage.workflowId, govSchema.deptWorkflow.id),
    )
    .where(eq(govSchema.deptWorkflow.deptId, deptId))
    .orderBy(asc(govSchema.deptWorkflowStage.position))
    .limit(1);

  return row ? toStageDto(row.stage) : null;
}

/** One stage by id, with its sibling ordering — used to work out what "next" means. */
export async function getStageById(stageId: string): Promise<WorkflowStageDto | null> {
  const [row] = await db
    .select()
    .from(govSchema.deptWorkflowStage)
    .where(eq(govSchema.deptWorkflowStage.id, stageId))
    .limit(1);

  return row ? toStageDto(row) : null;
}

/** The stage immediately after `position` in the same workflow, or null at the end of the list. */
export async function getNextStage(
  workflowId: string,
  position: number,
): Promise<WorkflowStageDto | null> {
  const rows = await db
    .select()
    .from(govSchema.deptWorkflowStage)
    .where(eq(govSchema.deptWorkflowStage.workflowId, workflowId))
    .orderBy(asc(govSchema.deptWorkflowStage.position));

  const next = rows.find((row) => row.position > position);
  return next ? toStageDto(next) : null;
}

/** The workflow row id for a stage, so callers can find its siblings. */
export async function getWorkflowIdForStage(stageId: string): Promise<string | null> {
  const [row] = await db
    .select({ workflowId: govSchema.deptWorkflowStage.workflowId })
    .from(govSchema.deptWorkflowStage)
    .where(eq(govSchema.deptWorkflowStage.id, stageId))
    .limit(1);

  return row?.workflowId ?? null;
}
