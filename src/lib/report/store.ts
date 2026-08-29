import "server-only";

import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import type {
  CivicCategory,
  FieldSource,
  ReportDto,
  ReportStatus,
  Severity,
} from "./schema";

/*
 * Report ownership and persistence.
 *
 * Every read here is scoped to (id AND userId) in the same query — never
 * "fetch by id, then check the owner in application code" — so there is no
 * code path that can return another citizen's draft by accident. This is
 * what test #3 ("user cannot access another user's report") is actually
 * verifying against.
 */

function newId(): string {
  return randomBytes(16).toString("base64url");
}

type ReportRow = typeof schema.report.$inferSelect;

function toDto(row: ReportRow): ReportDto {
  return {
    id: row.id,
    status: row.status as ReportStatus,
    hasImage: Boolean(row.imagePath),
    category: (row.category as CivicCategory | null) ?? null,
    categorySource: (row.categorySource as FieldSource | null) ?? null,
    visionConfidence: row.visionConfidence,
    visionEvidence: row.visionEvidence ? JSON.parse(row.visionEvidence) : [],
    visionConfirmed: row.visionConfirmed,
    transcript: row.transcript,
    transcriptLanguage: row.transcriptLanguage,
    transcriptSource: (row.transcriptSource as FieldSource | null) ?? null,
    latitude: row.latitude,
    longitude: row.longitude,
    locationAccuracyMeters: row.locationAccuracyMeters,
    locationLabel: row.locationLabel,
    locationSource: (row.locationSource as "gps" | "manual" | null) ?? null,
    title: row.title,
    titleSource: (row.titleSource as FieldSource | null) ?? null,
    description: row.description,
    descriptionSource: (row.descriptionSource as FieldSource | null) ?? null,
    severity: (row.severity as Severity | null) ?? null,
    severitySource: (row.severitySource as FieldSource | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createReportDraft(userId: string): Promise<ReportDto> {
  const id = newId();
  const now = new Date();

  await db.insert(schema.report).values({
    id,
    userId,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db
    .select()
    .from(schema.report)
    .where(eq(schema.report.id, id))
    .limit(1);

  return toDto(row!);
}

/** Null when the report doesn't exist OR belongs to someone else — the caller can't tell the difference, which is the point. */
export async function getOwnedReport(
  id: string,
  userId: string,
): Promise<ReportDto | null> {
  const [row] = await db
    .select()
    .from(schema.report)
    .where(and(eq(schema.report.id, id), eq(schema.report.userId, userId)))
    .limit(1);

  return row ? toDto(row) : null;
}

/** Internal row access for handlers that need fields the DTO doesn't expose (e.g. imagePath). Still ownership-scoped. */
export async function getOwnedReportRow(
  id: string,
  userId: string,
): Promise<ReportRow | null> {
  const [row] = await db
    .select()
    .from(schema.report)
    .where(and(eq(schema.report.id, id), eq(schema.report.userId, userId)))
    .limit(1);

  return row ?? null;
}

export async function listOwnedReports(userId: string): Promise<ReportDto[]> {
  const rows = await db
    .select()
    .from(schema.report)
    .where(eq(schema.report.userId, userId))
    .orderBy(desc(schema.report.createdAt));

  return rows.map(toDto);
}

/**
 * Updates a report the caller already proved they own (via getOwnedReport*).
 * Never call this with a raw id/patch pair from a request without an
 * ownership check immediately before it in the same handler.
 */
export async function updateOwnedReport(
  id: string,
  userId: string,
  patch: Partial<typeof schema.report.$inferInsert>,
): Promise<ReportDto | null> {
  await db
    .update(schema.report)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(schema.report.id, id), eq(schema.report.userId, userId)));

  return getOwnedReport(id, userId);
}
