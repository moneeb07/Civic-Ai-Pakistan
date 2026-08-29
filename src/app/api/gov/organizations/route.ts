import { badRequest, ok, readJson, unprocessable, withOfficer } from "@/lib/gov/api";
import { createOrganizationSchema } from "@/lib/gov/schema";
import { createOrganization, listOrganizationsForOfficer } from "@/lib/gov/store";
import { getDictionary } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * POST /api/gov/organizations — create a government body. Platform admin only:
 *   an org head creating a second organization would be creating a scope no
 *   one delegated to them.
 * GET  /api/gov/organizations — the organizations this officer may act on,
 *   scoped inside the query itself.
 */

export const POST = withOfficer(async ({ officer }, request) => {
  if (officer.role !== "platform_admin") {
    return badRequest(t.gov.common.forbidden, "role_not_permitted");
  }

  const body = await readJson(request);
  if (body === null) return badRequest("We couldn't read that request.");

  const parsed = createOrganizationSchema.safeParse(body);
  if (!parsed.success) return unprocessable("Please check the highlighted fields.");

  const created = await createOrganization(parsed.data);
  if ("error" in created) return badRequest(t.gov.admin.duplicateCode, created.error);

  return ok(created, 201);
});

export const GET = withOfficer(async ({ officer }) => {
  return ok(await listOrganizationsForOfficer(officer));
});
