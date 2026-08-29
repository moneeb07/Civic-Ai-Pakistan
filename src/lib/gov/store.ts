import "server-only";

import { and, asc, count, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { newId } from "./ids";
import type {
  CreateDepartmentValues,
  CreateOrganizationValues,
  DepartmentDto,
  OfficerDto,
  OfficerRole,
  OrganizationDto,
} from "./schema";

/*
 * Organizations, departments and officer records.
 *
 * Every read takes the caller's scope as an argument and puts it in the WHERE
 * clause — never "fetch everything, then filter in application code". This is
 * the same discipline src/lib/report/store.ts applies to citizen ownership,
 * for the same reason: a filter written in TypeScript can be forgotten at one
 * call site, a WHERE clause inside the only query that exists cannot.
 */

// -- Organizations ------------------------------------------------------------

export async function createOrganization(
  values: CreateOrganizationValues,
): Promise<OrganizationDto | { error: "duplicate_code" }> {
  const existing = await db
    .select({ id: govSchema.organization.id })
    .from(govSchema.organization)
    .where(eq(govSchema.organization.code, values.code))
    .limit(1);

  if (existing.length > 0) return { error: "duplicate_code" };

  const id = newId();
  await db.insert(govSchema.organization).values({
    id,
    name: values.name,
    code: values.code,
  });

  return { id, name: values.name, code: values.code, departmentCount: 0, createdAt: new Date().toISOString() };
}

/**
 * Organizations the officer may act on.
 *
 * A platform admin sees all of them; anyone else sees exactly their own, and
 * the scoping is a WHERE clause rather than a post-filter.
 */
export async function listOrganizationsForOfficer(officer: OfficerDto): Promise<OrganizationDto[]> {
  const rows = await db
    .select({
      id: govSchema.organization.id,
      name: govSchema.organization.name,
      code: govSchema.organization.code,
      createdAt: govSchema.organization.createdAt,
      departmentCount: count(govSchema.department.id),
    })
    .from(govSchema.organization)
    .leftJoin(govSchema.department, eq(govSchema.department.orgId, govSchema.organization.id))
    .where(
      officer.role === "platform_admin"
        ? undefined
        : eq(govSchema.organization.id, officer.orgId ?? "__none__"),
    )
    .groupBy(govSchema.organization.id)
    .orderBy(asc(govSchema.organization.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    departmentCount: Number(row.departmentCount),
    createdAt: row.createdAt.toISOString(),
  }));
}

// -- Departments ---------------------------------------------------------------

export async function createDepartment(
  values: CreateDepartmentValues,
): Promise<DepartmentDto | { error: "duplicate_name" | "org_not_found" }> {
  const [org] = await db
    .select({ id: govSchema.organization.id })
    .from(govSchema.organization)
    .where(eq(govSchema.organization.id, values.orgId))
    .limit(1);

  if (!org) return { error: "org_not_found" };

  const [duplicate] = await db
    .select({ id: govSchema.department.id })
    .from(govSchema.department)
    .where(
      and(eq(govSchema.department.orgId, values.orgId), eq(govSchema.department.name, values.name)),
    )
    .limit(1);

  if (duplicate) return { error: "duplicate_name" };

  const id = newId();
  await db.insert(govSchema.department).values({
    id,
    orgId: values.orgId,
    name: values.name,
    handlesCategories: values.handlesCategories,
  });

  return {
    id,
    orgId: values.orgId,
    name: values.name,
    handlesCategories: values.handlesCategories,
    hasWorkflow: false,
    createdAt: new Date().toISOString(),
  };
}

/** Departments inside one organization. The caller proves it may see that org first (canManageOrg). */
export async function listDepartments(orgId: string): Promise<DepartmentDto[]> {
  const rows = await db
    .select({
      id: govSchema.department.id,
      orgId: govSchema.department.orgId,
      name: govSchema.department.name,
      handlesCategories: govSchema.department.handlesCategories,
      createdAt: govSchema.department.createdAt,
      workflowId: govSchema.deptWorkflow.id,
    })
    .from(govSchema.department)
    .leftJoin(govSchema.deptWorkflow, eq(govSchema.deptWorkflow.deptId, govSchema.department.id))
    .where(eq(govSchema.department.orgId, orgId))
    .orderBy(asc(govSchema.department.name));

  return rows.map((row) => ({
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    handlesCategories: row.handlesCategories ?? [],
    hasWorkflow: Boolean(row.workflowId),
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Null when the department does not exist. Returns the parent org id so callers can authorize without a second query. */
export async function findDepartment(
  deptId: string,
): Promise<{ id: string; orgId: string; name: string } | null> {
  const [row] = await db
    .select({
      id: govSchema.department.id,
      orgId: govSchema.department.orgId,
      name: govSchema.department.name,
    })
    .from(govSchema.department)
    .where(eq(govSchema.department.id, deptId))
    .limit(1);

  return row ?? null;
}

// -- Officers -------------------------------------------------------------------

export async function createOfficer(input: {
  userId: string;
  role: OfficerRole;
  orgId: string | null;
  deptId: string | null;
}): Promise<string> {
  const id = newId();
  await db.insert(govSchema.officer).values({
    id,
    userId: input.userId,
    role: input.role,
    orgId: input.orgId,
    deptId: input.deptId,
  });
  return id;
}

/** The members a dept head can assign work to: their own department, members only. */
export async function listDepartmentMembers(deptId: string): Promise<OfficerDto[]> {
  const rows = await db
    .select({
      id: govSchema.officer.id,
      userId: govSchema.officer.userId,
      role: govSchema.officer.role,
      orgId: govSchema.officer.orgId,
      deptId: govSchema.officer.deptId,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(govSchema.officer)
    .innerJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(
      and(
        eq(govSchema.officer.deptId, deptId),
        inArray(govSchema.officer.role, ["member", "dept_head"]),
      ),
    )
    .orderBy(asc(schema.user.name));

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role as OfficerRole,
    orgId: row.orgId,
    orgName: null,
    deptId: row.deptId,
    deptName: null,
  }));
}

/** One officer, scoped to a department — used before assigning work to them. */
export async function findOfficerInDepartment(
  officerId: string,
  deptId: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: govSchema.officer.id, name: schema.user.name })
    .from(govSchema.officer)
    .innerJoin(schema.user, eq(schema.user.id, govSchema.officer.userId))
    .where(and(eq(govSchema.officer.id, officerId), eq(govSchema.officer.deptId, deptId)))
    .limit(1);

  return row ?? null;
}
