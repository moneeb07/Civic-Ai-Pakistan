import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { newId } from "./ids";

/*
 * The handoff back to the citizen. See src/lib/gov/README.md — this is the
 * seam the citizen-side agent renders.
 *
 * The government side cannot add a column to `report`: that table belongs to
 * the citizen side and this ticket's ownership rule forbids editing it. So
 * resolution is announced by writing a row here instead, and the citizen app
 * reads this table when it is ready to show an inbox. Nothing in this ticket
 * renders it.
 *
 * Deliberately not an email or a push: the platform has no transactional
 * email provider configured, and inventing one here would be a delivery
 * promise the system cannot keep.
 */

export interface ResolutionNotice {
  reportId: string;
  /** The citizen who filed it — read from `report`, never assumed from the officer's session. */
  userId: string;
  title: string;
  body: string;
}

/**
 * Records that a complaint reached its department's terminal stage.
 *
 * Idempotent per report: a complaint that is resolved, reopened and resolved
 * again produces a second notice, which is correct — the citizen genuinely
 * needs telling twice. What it never does is write a notice for a report it
 * cannot find an owner for.
 */
export async function notifyCitizenOfResolution(
  reportId: string,
  tx: Pick<typeof db, "insert" | "select"> = db,
): Promise<{ notified: boolean }> {
  const [row] = await tx
    .select({
      userId: schema.report.userId,
      title: schema.report.title,
      locationLabel: schema.report.locationLabel,
    })
    .from(schema.report)
    .where(eq(schema.report.id, reportId))
    .limit(1);

  if (!row) return { notified: false };

  // The citizen's own title where they have one — this is their complaint, and
  // echoing their words back is how they recognise which one resolved.
  const subject = row.title?.trim() || "Your complaint";
  const where = row.locationLabel?.trim();

  await tx.insert(govSchema.citizenNotification).values({
    id: newId(),
    reportId,
    userId: row.userId,
    kind: "resolved",
    title: "Your complaint has been resolved",
    body: where
      ? `"${subject}" at ${where} has been marked resolved by the department handling it.`
      : `"${subject}" has been marked resolved by the department handling it.`,
  });

  return { notified: true };
}

export interface CitizenNotificationDto {
  id: string;
  reportId: string;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

/**
 * Read helper for the citizen side.
 *
 * Exported from the gov namespace because the gov side owns this table, but
 * intended to be called by citizen-side code — scoped by userId in the WHERE
 * clause so it can only ever return the caller's own notifications.
 */
export async function listCitizenNotifications(
  userId: string,
): Promise<CitizenNotificationDto[]> {
  const rows = await db
    .select()
    .from(govSchema.citizenNotification)
    .where(eq(govSchema.citizenNotification.userId, userId));

  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      reportId: row.reportId,
      kind: row.kind,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt ? row.readAt.toISOString() : null,
    }));
}
