import { eq } from "drizzle-orm";

import { db } from "@/db";
import { govSchema, schema } from "@/db/schema";
import { auth } from "@/lib/auth";
import { badRequest, notFound, readJson, unprocessable } from "@/lib/gov/api";
import { consumeInvite, lookupInviteByToken } from "@/lib/gov/invites";
import { acceptInviteSchema, ROLE_HOME } from "@/lib/gov/schema";
import { createOfficer } from "@/lib/gov/store";
import { recordDeptEvent } from "@/lib/gov/events";
import { getDictionary } from "@/lib/i18n";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const t = getDictionary();

/*
 * POST /api/gov/invites/[token]/accept
 *
 * The dynamic segment is the invite TOKEN, not the invite id — the folder is
 * named [id] only because Next.js forbids two differently-named dynamic
 * segments at the same level (the sibling route uses [id] for revoke). The
 * public URL shape is /api/gov/invites/<token>/accept, per the ticket.
 *
 * The only place a government account is created. Order matters, and it is
 * the same order the citizen side's registration/complete route uses:
 *
 *   validate token -> validate body -> consume invite -> create auth user
 *   -> create officer row
 *
 * The invite is consumed FIRST, with `usedAt IS NULL` inside the UPDATE, so
 * two people accepting the same token race on a single row and exactly one
 * wins. If anything after that fails, the user and invite are rolled back by
 * hand — Better Auth owns its own connection and cannot join our transaction,
 * so a compensating delete is the only honest way to avoid stranding an
 * account with credentials but no government access.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: token } = await params;

  const lookup = await lookupInviteByToken(token);
  if (lookup.status !== "valid") {
    return notFound(
      lookup.status === "expired"
        ? t.gov.invite.expiredBody
        : lookup.status === "used"
          ? t.gov.invite.usedBody
          : t.gov.invite.invalidBody,
    );
  }

  const body = await readJson(request);
  if (body === null) return badRequest("We couldn't read that request.");

  const parsed = acceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return unprocessable("Please check the highlighted fields.");
  }

  const { invite } = lookup;

  // Claim the invite before creating anything. A second request arriving now
  // finds usedAt already set and is turned away.
  const claimed = await consumeInvite(invite.id);
  if (!claimed) return notFound(t.gov.invite.usedBody);

  let userId: string;
  let setCookieHeaders: string[] = [];

  try {
    const { headers, response } = await auth.api.signUpEmail({
      body: {
        name: parsed.data.name,
        email: invite.email,
        password: parsed.data.password,
      },
      returnHeaders: true,
    });

    const created = response?.user?.id;
    if (!created) throw new Error("no user id returned");

    userId = created;
    setCookieHeaders = headers.getSetCookie();
  } catch (error) {
    // Release the invite so the person can try again — the failure was ours.
    await releaseInvite(invite.id);

    const message =
      error instanceof Error && /exist/i.test(error.message)
        ? "An account already exists with this email address. Please sign in instead."
        : "We couldn't create your account right now. Please try again.";

    // Never log the password or the token alongside the failure.
    console.error("[gov] officer account creation failed");
    return badRequest(message, "signup_failed");
  }

  try {
    await createOfficer({
      userId,
      role: invite.role,
      orgId: invite.orgId,
      deptId: invite.deptId,
    });
  } catch (error) {
    /*
     * The auth user exists but has no officer row, which would leave someone
     * able to sign in with no government access at all. Roll both back rather
     * than strand them in that state — the same compensating delete the
     * citizen registration route performs when profile creation fails.
     */
    console.error(
      "[gov] officer record creation failed; rolling back auth user:",
      error instanceof Error ? error.message : error,
    );
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    await releaseInvite(invite.id);

    return badRequest("We couldn't finish setting up your account. Please try again.", "officer_failed");
  }

  if (invite.deptId) {
    await recordDeptEvent({
      deptId: invite.deptId,
      actorOfficerId: null,
      eventType: "accepted_invite",
      metadata: { role: invite.role, email: invite.email },
    });
  }

  const json = NextResponse.json({
    success: true,
    data: { redirectTo: ROLE_HOME[invite.role] },
  });

  // Forward Better Auth's session cookies so the officer lands signed in.
  for (const cookie of setCookieHeaders) {
    json.headers.append("set-cookie", cookie);
  }

  return json;
}

/** Undoes consumeInvite() when account creation failed after the claim. */
async function releaseInvite(inviteId: string): Promise<void> {
  await db
    .update(govSchema.officerInvite)
    .set({ usedAt: null })
    .where(eq(govSchema.officerInvite.id, inviteId));
}
