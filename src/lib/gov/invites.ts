import "server-only";

import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";

import { db } from "@/db";
import { govSchema } from "@/db/schema";
import { newId, newInviteToken } from "./ids";
import {
  INVITE_RATE_LIMIT,
  INVITE_RATE_WINDOW_MS,
  INVITE_TTL_MS,
  type InviteDto,
  type OfficerRole,
} from "./schema";

/*
 * Officer invitations.
 *
 * There is no public sign-up for the government portal. An officer account
 * exists only because someone with authority created an invite for that
 * address, which is why the token is the single credential that permits
 * account creation and why it expires.
 */

export interface PendingInvite {
  id: string;
  email: string;
  role: OfficerRole;
  orgId: string | null;
  deptId: string | null;
  expiresAt: Date;
}

export async function createInvite(input: {
  email: string;
  role: OfficerRole;
  orgId: string | null;
  deptId: string | null;
  createdByOfficerId: string;
}): Promise<{ id: string; token: string; expiresAt: Date } | { error: "already_invited" }> {
  // A live invite for this address already grants access; issuing a second one
  // would let two accounts race to claim it. The partial unique index in the
  // schema is the backstop, this is the readable error.
  const [pending] = await db
    .select({ id: govSchema.officerInvite.id })
    .from(govSchema.officerInvite)
    .where(
      and(
        eq(govSchema.officerInvite.email, input.email),
        isNull(govSchema.officerInvite.usedAt),
      ),
    )
    .limit(1);

  if (pending) return { error: "already_invited" };

  const id = newId();
  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db.insert(govSchema.officerInvite).values({
    id,
    email: input.email,
    role: input.role,
    orgId: input.orgId,
    deptId: input.deptId,
    token,
    createdByOfficerId: input.createdByOfficerId,
    expiresAt,
  });

  return { id, token, expiresAt };
}

/**
 * How many invites this officer has created in the last hour.
 *
 * Counted from the invite table itself rather than a separate counter so it
 * survives a restart and cannot drift from reality. Revoked invites still
 * count — the limit exists to cap outbound email, and a revoked invite was
 * still sent.
 */
export async function countRecentInvites(officerId: string): Promise<number> {
  const since = new Date(Date.now() - INVITE_RATE_WINDOW_MS);

  const rows = await db
    .select({ id: govSchema.officerInvite.id })
    .from(govSchema.officerInvite)
    .where(
      and(
        eq(govSchema.officerInvite.createdByOfficerId, officerId),
        gte(govSchema.officerInvite.createdAt, since),
      ),
    );

  return rows.length;
}

export function isRateLimited(recentCount: number): boolean {
  return recentCount >= INVITE_RATE_LIMIT;
}

/**
 * Pending invites, scoped in SQL.
 *
 * A platform admin sees every live invite; anyone else sees only the ones
 * they created — an org head has no business reading a peer organization's
 * pending invitations.
 */
export async function listPendingInvites(
  officerId: string,
  isPlatformAdmin: boolean,
): Promise<InviteDto[]> {
  const scope = isPlatformAdmin
    ? isNull(govSchema.officerInvite.usedAt)
    : and(
        isNull(govSchema.officerInvite.usedAt),
        eq(govSchema.officerInvite.createdByOfficerId, officerId),
      );

  const rows = await db
    .select({
      id: govSchema.officerInvite.id,
      email: govSchema.officerInvite.email,
      role: govSchema.officerInvite.role,
      orgId: govSchema.officerInvite.orgId,
      deptId: govSchema.officerInvite.deptId,
      expiresAt: govSchema.officerInvite.expiresAt,
      createdAt: govSchema.officerInvite.createdAt,
      orgName: govSchema.organization.name,
      deptName: govSchema.department.name,
    })
    .from(govSchema.officerInvite)
    .leftJoin(govSchema.organization, eq(govSchema.organization.id, govSchema.officerInvite.orgId))
    .leftJoin(govSchema.department, eq(govSchema.department.id, govSchema.officerInvite.deptId))
    .where(scope)
    .orderBy(desc(govSchema.officerInvite.createdAt));

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as OfficerRole,
    orgId: row.orgId,
    orgName: row.orgName,
    deptId: row.deptId,
    deptName: row.deptName,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Revokes an unused invite.
 *
 * Scoped to the creating officer in the WHERE clause (unless platform admin),
 * so revoking someone else's invite deletes nothing and reports not-found —
 * it never confirms that the id exists.
 */
export async function revokeInvite(
  inviteId: string,
  officerId: string,
  isPlatformAdmin: boolean,
): Promise<boolean> {
  const scope = isPlatformAdmin
    ? and(eq(govSchema.officerInvite.id, inviteId), isNull(govSchema.officerInvite.usedAt))
    : and(
        eq(govSchema.officerInvite.id, inviteId),
        isNull(govSchema.officerInvite.usedAt),
        eq(govSchema.officerInvite.createdByOfficerId, officerId),
      );

  // `returning()` with no field list: the two Drizzle drivers this project
  // supports (node-postgres and PGlite) expose different overloads for the
  // projected form, and only the row count matters here.
  const deleted = await db.delete(govSchema.officerInvite).where(scope).returning();

  return deleted.length > 0;
}

export type InviteLookup =
  | { status: "valid"; invite: PendingInvite; orgName: string | null; deptName: string | null }
  | { status: "not_found" | "expired" | "used" };

/**
 * Looks a token up for the acceptance screen.
 *
 * Distinguishes not-found / expired / used because each needs a different
 * message: an expired invite can be re-requested, a used one means the
 * account already exists, and neither is the dead end a bare 404 would be.
 */
export async function lookupInviteByToken(token: string): Promise<InviteLookup> {
  const [row] = await db
    .select({
      id: govSchema.officerInvite.id,
      email: govSchema.officerInvite.email,
      role: govSchema.officerInvite.role,
      orgId: govSchema.officerInvite.orgId,
      deptId: govSchema.officerInvite.deptId,
      expiresAt: govSchema.officerInvite.expiresAt,
      usedAt: govSchema.officerInvite.usedAt,
      orgName: govSchema.organization.name,
      deptName: govSchema.department.name,
    })
    .from(govSchema.officerInvite)
    .leftJoin(govSchema.organization, eq(govSchema.organization.id, govSchema.officerInvite.orgId))
    .leftJoin(govSchema.department, eq(govSchema.department.id, govSchema.officerInvite.deptId))
    .where(eq(govSchema.officerInvite.token, token))
    .limit(1);

  if (!row) return { status: "not_found" };
  if (row.usedAt) return { status: "used" };
  if (row.expiresAt.getTime() <= Date.now()) return { status: "expired" };

  return {
    status: "valid",
    invite: {
      id: row.id,
      email: row.email,
      role: row.role as OfficerRole,
      orgId: row.orgId,
      deptId: row.deptId,
      expiresAt: row.expiresAt,
    },
    orgName: row.orgName,
    deptName: row.deptName,
  };
}

/**
 * Marks an invite consumed, but only if it is still unused.
 *
 * The `usedAt IS NULL` predicate is inside the UPDATE rather than checked
 * beforehand, so two simultaneous acceptances of the same token cannot both
 * succeed: exactly one UPDATE matches a row, the other gets zero and is
 * rejected. Returns false when the invite was already taken.
 */
export async function consumeInvite(inviteId: string): Promise<boolean> {
  const updated = await db
    .update(govSchema.officerInvite)
    .set({ usedAt: new Date() })
    .where(and(eq(govSchema.officerInvite.id, inviteId), isNull(govSchema.officerInvite.usedAt)))
    .returning();

  return updated.length > 0;
}

/** Invites are ordered oldest-first when shown inline on a scope's own page. */
export async function listInvitesForScope(deptId: string): Promise<InviteDto[]> {
  const rows = await db
    .select({
      id: govSchema.officerInvite.id,
      email: govSchema.officerInvite.email,
      role: govSchema.officerInvite.role,
      orgId: govSchema.officerInvite.orgId,
      deptId: govSchema.officerInvite.deptId,
      expiresAt: govSchema.officerInvite.expiresAt,
      createdAt: govSchema.officerInvite.createdAt,
    })
    .from(govSchema.officerInvite)
    .where(and(eq(govSchema.officerInvite.deptId, deptId), isNull(govSchema.officerInvite.usedAt)))
    .orderBy(asc(govSchema.officerInvite.createdAt));

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as OfficerRole,
    orgId: row.orgId,
    orgName: null,
    deptId: row.deptId,
    deptName: null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));
}
