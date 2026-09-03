import { badRequest, notFound, ok, readJson, unauthorized, unprocessable } from "@/lib/gov/api";
import { canManageDept } from "@/lib/gov/authorize";
import { workflowSchema } from "@/lib/gov/schema";
import { getOfficer } from "@/lib/gov/session";
import { findDepartment } from "@/lib/gov/store";
import { getWorkflow, saveWorkflow } from "@/lib/gov/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/gov/departments/[deptId]/workflow — the saved workflow, or the
 *   seeded default flagged `isTemplate: true` when none has been saved.
 * PUT /api/gov/departments/[deptId]/workflow — replaces the whole stage list
 *   atomically. The client sends the full list, never a diff, so the order on
 *   screen is exactly the order stored.
 *
 * The same Zod schema the builder validates against runs again here — the
 * "exactly one terminal stage" rule is not something the client can waive.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deptId: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { deptId } = await params;
  const dept = await findDepartment(deptId);
  if (!dept || !canManageDept(context.officer, dept.id, dept.orgId)) return notFound();

  return ok(await getWorkflow(deptId));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ deptId: string }> },
) {
  const context = await getOfficer();
  if (!context) return unauthorized();

  const { deptId } = await params;
  const dept = await findDepartment(deptId);
  if (!dept || !canManageDept(context.officer, dept.id, dept.orgId)) return notFound();

  const body = await readJson(request);
  if (body === null) return badRequest("We couldn't read that request.");

  const parsed = workflowSchema.safeParse(body);
  if (!parsed.success) {
    // Field paths are returned so the builder can put each message beside the
    // stage it belongs to rather than showing one banner for the whole form.
    return unprocessable("This workflow isn't valid yet.");
  }

  const saved = await saveWorkflow({
    deptId,
    officerId: context.officer.id,
    values: parsed.data,
  });

  return ok(saved);
}
