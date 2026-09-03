import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { govSchema } from "@/db/schema";
import { newId } from "./ids";
import type { ComplaintEventType } from "./schema";

/*
 * The complaint audit log.
 *
 * Append-only by construction: there is no update or delete here, only
 * `recordEvent`. Every state change on the government side writes one, so
 * "who moved this complaint, and when" is answerable from the database alone
 * rather than from server logs that rotate away.
 *
 * `metadata` is JSON in a text column, matching how report.visionEvidence and
 * registrationSession.data already store JSON in this codebase.
 */

export interface RecordEventInput {
  reportId: string;
  /** Null for system-generated events — nothing pretends a person did them. */
  actorOfficerId: string | null;
  eventType: ComplaintEventType;
  metadata?: Record<string, unknown>;
}

/** `tx` accepts a transaction handle so an event and the change it records commit together. */
type Inserter = Pick<typeof db, "insert">;

export async function recordEvent(
  input: RecordEventInput,
  tx: Inserter = db,
): Promise<void> {
  await tx.insert(govSchema.complaintEvent).values({
    id: newId(),
    reportId: input.reportId,
    deptId: null,
    actorOfficerId: input.actorOfficerId,
    eventType: input.eventType,
    metadata: JSON.stringify(input.metadata ?? {}),
  });
}

/**
 * An auditable act that belongs to a department rather than one complaint —
 * today only `workflow_updated`, which changes how every future complaint in
 * that department is handled.
 */
export async function recordDeptEvent(
  input: {
    deptId: string;
    actorOfficerId: string | null;
    eventType: ComplaintEventType;
    metadata?: Record<string, unknown>;
  },
  tx: Inserter = db,
): Promise<void> {
  await tx.insert(govSchema.complaintEvent).values({
    id: newId(),
    reportId: null,
    deptId: input.deptId,
    actorOfficerId: input.actorOfficerId,
    eventType: input.eventType,
    metadata: JSON.stringify(input.metadata ?? {}),
  });
}

export interface ComplaintEventDto {
  id: string;
  eventType: string;
  actorOfficerId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * The timeline for one complaint, newest first.
 *
 * Takes no scope argument on purpose: the caller has already proved it may
 * view this complaint (canViewComplaint + a dept-scoped assignment lookup)
 * before it gets here. Callers must not reach this with an unchecked id.
 */
export async function listComplaintEvents(reportId: string): Promise<ComplaintEventDto[]> {
  const rows = await db
    .select()
    .from(govSchema.complaintEvent)
    .where(eq(govSchema.complaintEvent.reportId, reportId))
    .orderBy(desc(govSchema.complaintEvent.createdAt));

  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    actorOfficerId: row.actorOfficerId,
    metadata: safeParseMetadata(row.metadata),
    createdAt: row.createdAt.toISOString(),
  }));
}

function safeParseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    // A malformed row must not break a whole timeline render.
    return {};
  }
}
