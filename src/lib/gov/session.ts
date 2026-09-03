import "server-only";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

// `govSchema` comes from the schema module directly: src/db/index.ts belongs
// to the citizen side and re-exporting from it would mean editing it.
import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { getSession } from "@/lib/session";
import type { OfficerRole, OfficerDto } from "./schema";

/*
 * The authoritative government-side guard.
 *
 * Two layers, exactly like the citizen side: proxy.ts checks only that a
 * session cookie is present (so an officer never sees a page flash), and this
 * verifies the session against the database AND that the user has an officer
 * row at all. A citizen with a perfectly valid session has no officer row and
 * is therefore not a government user — signing in is not the same as having
 * government access.
 */

export interface OfficerContext {
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  officer: OfficerDto;
}

/** Loads the officer record for a user id, resolving org and dept names in the same query. */
export async function findOfficerByUserId(userId: string): Promise<OfficerDto | null> {
  const [row] = await db
    .select({
      id: govSchema.officer.id,
      userId: govSchema.officer.userId,
      role: govSchema.officer.role,
      orgId: govSchema.officer.orgId,
      deptId: govSchema.officer.deptId,
      name: schema.user.name,
      email: schema.user.email,
      orgName: govSchema.organization.name,
      deptName: govSchema.department.name,
    })
    .from(govSchema.officer)
    .innerJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .leftJoin(govSchema.organization, eq(govSchema.organization.id, govSchema.officer.orgId))
    .leftJoin(govSchema.department, eq(govSchema.department.id, govSchema.officer.deptId))
    .where(eq(govSchema.officer.userId, userId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role as OfficerRole,
    orgId: row.orgId,
    orgName: row.orgName,
    deptId: row.deptId,
    deptName: row.deptName,
  };
}

/**
 * Use on every protected government page.
 * Redirects to /gov/login when there is no valid session or no officer row.
 */
export async function requireOfficer(): Promise<OfficerContext> {
  const session = await getSession();
  if (!session) redirect("/gov/login");

  const officer = await findOfficerByUserId(session.user.id);
  if (!officer) redirect("/gov/login?reason=no_access");

  return { session, officer };
}

/**
 * The route-handler equivalent: returns null instead of redirecting, so the
 * caller can answer with the standard 401 envelope rather than an HTML redirect.
 */
export async function getOfficer(): Promise<OfficerContext | null> {
  const session = await getSession();
  if (!session) return null;

  const officer = await findOfficerByUserId(session.user.id);
  if (!officer) return null;

  return { session, officer };
}

// -- Role narrowing ----------------------------------------------------------

/*
 * The scope columns are nullable in the database because their meaning depends
 * on the role. These predicates narrow that away: past an isDeptHead() check,
 * TypeScript knows deptId is a string, so downstream code never has to write a
 * non-null assertion to satisfy a rule the CHECK constraint already enforces.
 */

export function isPlatformAdmin(
  officer: OfficerDto,
): officer is OfficerDto & { role: "platform_admin"; orgId: null; deptId: null } {
  return officer.role === "platform_admin";
}

export function isOrgHead(
  officer: OfficerDto,
): officer is OfficerDto & { role: "org_head"; orgId: string } {
  return officer.role === "org_head" && officer.orgId !== null;
}

export function isDeptHead(
  officer: OfficerDto,
): officer is OfficerDto & { role: "dept_head"; orgId: string; deptId: string } {
  return officer.role === "dept_head" && officer.orgId !== null && officer.deptId !== null;
}

export function isMember(
  officer: OfficerDto,
): officer is OfficerDto & { role: "member"; orgId: string; deptId: string } {
  return officer.role === "member" && officer.orgId !== null && officer.deptId !== null;
}
