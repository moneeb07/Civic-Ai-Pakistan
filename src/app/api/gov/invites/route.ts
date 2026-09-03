import { getDictionary } from "@/lib/i18n";
import { badRequest, ok, unprocessable, readJson, withOfficer } from "@/lib/gov/api";
import { canInvite } from "@/lib/gov/authorize";
import { govEnv } from "@/lib/gov/env";
import {
  countRecentInvites,
  createInvite,
  isRateLimited,
  listPendingInvites,
} from "@/lib/gov/invites";
import { createInviteSchema } from "@/lib/gov/schema";
import { findDepartment } from "@/lib/gov/store";
import { sendInviteEmail } from "@/services/email/invite-mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * POST /api/gov/invites — create and deliver an invitation.
 * GET  /api/gov/invites — pending invitations this officer may see.
 *
 * Authorization is one call to canInvite(), which decides both the role pair
 * (who may invite whom) and the scope (into which org/dept). Nothing about
 * that rule is re-derived here.
 */

export const POST = withOfficer(async ({ officer }, request) => {
  const body = await readJson(request);
  if (body === null) return badRequest("We couldn't read that request.");

  const parsed = createInviteSchema.safeParse(body);
  if (!parsed.success) {
    return unprocessable("Please check the highlighted fields.");
  }

  const target = {
    role: parsed.data.role,
    orgId: parsed.data.orgId ?? null,
    deptId: parsed.data.deptId ?? null,
  };

  const permission = canInvite(officer, target);
  if (!permission.allowed) {
    return badRequest(t.gov.invite.notPermitted, permission.reason);
  }

  // Cap outbound mail per officer per hour. Checked before the insert so a
  // rate-limited request writes nothing at all.
  const recent = await countRecentInvites(officer.id);
  if (isRateLimited(recent)) {
    return badRequest(t.gov.invite.rateLimited, "rate_limited");
  }

  // Resolve the department's real parent org rather than trusting the body:
  // a dept id and an org id that disagree would otherwise create an invite
  // whose scope the CHECK constraint accepts but which points across orgs.
  let orgName: string | undefined;
  let deptName: string | undefined;

  if (target.deptId) {
    const dept = await findDepartment(target.deptId);
    if (!dept || dept.orgId !== target.orgId) {
      return badRequest("That department isn't part of that organization.", "out_of_scope");
    }
    deptName = dept.name;
  }
  if (target.orgId) {
    orgName = officer.orgId === target.orgId ? (officer.orgName ?? undefined) : undefined;
  }

  const created = await createInvite({
    email: parsed.data.email,
    role: target.role,
    orgId: target.orgId,
    deptId: target.deptId,
    createdByOfficerId: officer.id,
  });

  if ("error" in created) {
    return badRequest(t.gov.invite.alreadyInvited, created.error);
  }

  const inviteUrl = `${govEnv().BETTER_AUTH_URL}/gov/invite/${created.token}`;

  try {
    const result = await sendInviteEmail({
      to: parsed.data.email,
      inviteUrl,
      role: target.role,
      orgName,
      deptName,
      expiresAt: created.expiresAt,
    });

    return ok({ inviteId: created.id, delivered: result.delivered });
  } catch (error) {
    /*
     * Delivery failed — most likely EMAIL_ROUTING_ENABLED=true with the SMTP
     * branch still throwing "not yet implemented". The invite row already
     * exists and its token is valid, so the honest answer is that the invite
     * was created but not delivered, not a blanket failure.
     */
    console.error("[gov] invite delivery failed:", error instanceof Error ? error.message : error);
    return ok({ inviteId: created.id, delivered: null }, 202);
  }
});

export const GET = withOfficer(async ({ officer }) => {
  const invites = await listPendingInvites(officer.id, officer.role === "platform_admin");
  return ok(invites);
});
