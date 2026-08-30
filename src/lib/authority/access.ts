import "server-only";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  authority,
  authorityMember,
  conversationParticipant,
  department,
  issueConversation,
} from "@/db/authority/schema";
import { getSession } from "@/lib/session";
import {
  buildViewer,
  canAccessPrivateConversation,
  canAccessIssue,
  type AuthorityViewer,
  type ViewerMembership,
} from "@/lib/authority/permissions";
import type { AccessType, ConversationVisibility } from "@/lib/authority/schema";

/*
 * The rules live in permissions.ts, which has no database and no session and
 * is unit-tested directly. This file's job is only to LOAD the viewer and
 * apply them — so there is exactly one definition of who can see what.
 */
export {
  actingMembership,
  adminMembership,
  canAccessDepartment,
  canAccessIssue,
  isAdminOf,
  type AuthorityViewer,
  type ViewerMembership,
} from "@/lib/authority/permissions";

/*
 * Every authorisation decision for the authority side, in one place.
 *
 * Two rules underpin all of it:
 *
 *   1. Access is derived from the database on every request, never from
 *      anything the client sends. A page or route that wants to know what
 *      someone may see calls in here; it does not read an id out of a URL and
 *      trust it.
 *   2. A department member sees their own departments and nothing else. An
 *      authority admin sees their whole authority. There is no third level and
 *      no seniority — the two access types decide administration rights only,
 *      never who may talk to whom.
 *
 * This module is server-only: it can never be pulled into a client bundle,
 * so these checks cannot be "moved to the frontend" by accident.
 */

/**
 * Resolves the signed-in user's authority access, or null.
 *
 * Null covers both "not signed in" and "signed in as an ordinary citizen" —
 * callers must treat them the same, because distinguishing them would let an
 * outsider probe which accounts belong to authority staff.
 */
export async function getAuthorityViewer(): Promise<AuthorityViewer | null> {
  const session = await getSession();
  if (!session) return null;

  const rows = await db
    .select({
      memberId: authorityMember.id,
      memberCode: authorityMember.memberCode,
      displayName: authorityMember.displayName,
      accessType: authorityMember.accessType,
      authorityId: authority.id,
      authorityCode: authority.code,
      authorityName: authority.name,
      departmentId: department.id,
      departmentName: department.name,
    })
    .from(authorityMember)
    .innerJoin(authority, eq(authorityMember.authorityId, authority.id))
    .leftJoin(department, eq(authorityMember.departmentId, department.id))
    .where(
      and(
        eq(authorityMember.userId, session.user.id),
        // An account that has been deactivated keeps its history but loses
        // its access immediately — no separate revocation step to forget.
        eq(authorityMember.active, true),
      ),
    );

  if (rows.length === 0) return null;

  const memberships: ViewerMembership[] = rows.map((row) => ({
    ...row,
    accessType: row.accessType as AccessType,
  }));

  return buildViewer(session.user.id, memberships);
}

/** Use on authority pages. Sends anyone without access away from the section. */
export async function requireAuthorityViewer(): Promise<AuthorityViewer> {
  const viewer = await getAuthorityViewer();
  /*
   * Deliberately the citizen dashboard rather than a 403. A signed-in citizen
   * who follows a stray link lands somewhere useful, and an outsider learns
   * nothing about whether the section exists.
   */
  if (!viewer) redirect("/dashboard");
  return viewer;
}

export async function requireAuthorityAdmin(): Promise<AuthorityViewer> {
  const viewer = await requireAuthorityViewer();
  if (!viewer.isAdmin) redirect("/authority");
  return viewer;
}

/**
 * Whether the viewer may read and post in a conversation.
 *
 * Department threads follow the issue's own access rule. A PRIVATE thread is
 * different in kind: participation is explicit, and being an admin is not a
 * way in. An admin who needs the context has to be added like anyone else —
 * otherwise "private" would only mean "private from your colleagues".
 */
export async function canAccessConversation(
  viewer: AuthorityViewer,
  conversation: {
    id: string;
    visibility: ConversationVisibility;
    issueAuthorityId: string;
    issueDepartmentId: string | null;
  },
): Promise<boolean> {
  if (conversation.visibility === "department") {
    return canAccessIssue(viewer, {
      authorityId: conversation.issueAuthorityId,
      departmentId: conversation.issueDepartmentId,
    });
  }

  const participants = await db
    .select({ memberId: conversationParticipant.memberId })
    .from(conversationParticipant)
    .where(eq(conversationParticipant.conversationId, conversation.id));

  return canAccessPrivateConversation(
    viewer,
    participants.map((row) => row.memberId),
  );
}

/** Loads a conversation with the issue fields the access check needs. */
export async function loadConversationForAccess(conversationId: string) {
  const { civicIssue } = await import("@/db/authority/schema");

  const [row] = await db
    .select({
      id: issueConversation.id,
      title: issueConversation.title,
      visibility: issueConversation.visibility,
      issueId: issueConversation.issueId,
      issueCode: civicIssue.issueCode,
      issueAuthorityId: civicIssue.authorityId,
      issueDepartmentId: civicIssue.departmentId,
    })
    .from(issueConversation)
    .innerJoin(civicIssue, eq(issueConversation.issueId, civicIssue.id))
    .where(eq(issueConversation.id, conversationId))
    .limit(1);

  if (!row) return null;
  return { ...row, visibility: row.visibility as ConversationVisibility };
}
