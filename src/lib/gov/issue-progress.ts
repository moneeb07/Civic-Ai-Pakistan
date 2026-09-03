import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { deriveStatus, type CivicStatus } from "@/lib/civic/status";

/*
 * Where one issue stands, and how it got there.
 *
 * The lifecycle status is DERIVED from the department's own workflow rather
 * than stored, so it cannot drift from the stage the issue is actually on —
 * see lib/civic/status.ts for why that mapping lives in one place.
 */

export interface IssueProgress {
  status: CivicStatus;
  /** The department's own name for the current stage. */
  stageName: string | null;
  stagePosition: number | null;
  totalStages: number;
  /** Stage entries, oldest first — the append-only history. */
  history: {
    id: string;
    stageName: string;
    isTerminal: boolean;
    enteredAt: Date;
    actor: string | null;
    note: string | null;
  }[];
}

export async function getIssueProgress(issueId: string): Promise<IssueProgress | null> {
  const [assignment] = await db
    .select({
      id: govSchema.complaintAssignment.id,
      deptId: govSchema.complaintAssignment.deptId,
      currentStageId: govSchema.complaintAssignment.currentStageId,
    })
    .from(govSchema.complaintAssignment)
    .where(eq(govSchema.complaintAssignment.issueId, issueId))
    .limit(1);

  // No assignment means no department has taken it: still "Reported".
  if (!assignment) {
    return {
      status: "REPORTED",
      stageName: null,
      stagePosition: null,
      totalStages: 0,
      history: [],
    };
  }

  const stages = await db
    .select({
      id: govSchema.deptWorkflowStage.id,
      name: govSchema.deptWorkflowStage.name,
      position: govSchema.deptWorkflowStage.position,
      isTerminal: govSchema.deptWorkflowStage.isTerminal,
    })
    .from(govSchema.deptWorkflowStage)
    .innerJoin(
      govSchema.deptWorkflow,
      eq(govSchema.deptWorkflow.id, govSchema.deptWorkflowStage.workflowId),
    )
    .where(eq(govSchema.deptWorkflow.deptId, assignment.deptId))
    .orderBy(asc(govSchema.deptWorkflowStage.position));

  const current = stages.find((stage) => stage.id === assignment.currentStageId) ?? null;

  const progress = await db
    .select({
      id: govSchema.complaintStageProgress.id,
      enteredAt: govSchema.complaintStageProgress.enteredAt,
      note: govSchema.complaintStageProgress.note,
      stageName: govSchema.deptWorkflowStage.name,
      isTerminal: govSchema.deptWorkflowStage.isTerminal,
      actor: schema.user.name,
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
    .where(eq(govSchema.complaintStageProgress.assignmentId, assignment.id))
    .orderBy(asc(govSchema.complaintStageProgress.enteredAt));

  return {
    status: deriveStatus({
      stageName: current?.name ?? null,
      isResolved: current?.isTerminal ?? false,
    }),
    stageName: current?.name ?? null,
    stagePosition: current ? current.position + 1 : null,
    totalStages: stages.length,
    history: progress,
  };
}
