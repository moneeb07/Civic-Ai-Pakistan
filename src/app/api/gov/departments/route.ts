import { badRequest, notFound, ok, readJson, unprocessable, withOfficer } from "@/lib/gov/api";
import { canManageOrg } from "@/lib/gov/authorize";
import { createDepartmentSchema } from "@/lib/gov/schema";
import { createDepartment, listDepartments } from "@/lib/gov/store";
import { getDictionary } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * POST /api/gov/departments — add a department to an organization.
 * GET  /api/gov/departments?orgId=… — that organization's departments.
 *
 * Both authorize with canManageOrg() and answer 404 (never 403) when the
 * caller has no claim to the organization, so the endpoint never confirms
 * that an org id belongs to someone else.
 */

export const POST = withOfficer(async ({ officer }, request) => {
  const body = await readJson(request);
  if (body === null) return badRequest("We couldn't read that request.");

  const parsed = createDepartmentSchema.safeParse(body);
  if (!parsed.success) return unprocessable("Please check the highlighted fields.");

  if (!canManageOrg(officer, parsed.data.orgId)) return notFound();

  const created = await createDepartment(parsed.data);
  if ("error" in created) {
    return created.error === "org_not_found"
      ? notFound()
      : badRequest(t.gov.org.duplicateDept, created.error);
  }

  return ok(created, 201);
});

export const GET = withOfficer(async ({ officer }, request) => {
  const orgId = new URL(request.url).searchParams.get("orgId");
  if (!orgId) return badRequest("An organization is required.", "missing_org");
  if (!canManageOrg(officer, orgId)) return notFound();

  return ok(await listDepartments(orgId));
});
