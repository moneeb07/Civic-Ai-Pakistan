/*
 * The authorisation rules themselves, with no database and no session.
 *
 * Split out of access.ts (which is server-only) for one reason: these are the
 * rules that decide who can see whose work, and rules that important should be
 * testable directly rather than only through a live request. access.ts loads
 * the viewer and calls in here; nothing else re-derives access for itself.
 */

import type { AccessType } from "@/lib/authority/schema";

export interface ViewerMembership {
  memberId: string;
  memberCode: string;
  displayName: string;
  accessType: AccessType;
  authorityId: string;
  authorityCode: string;
  authorityName: string;
  /** Null for an authority admin, who is not scoped to one department. */
  departmentId: string | null;
  departmentName: string | null;
}

export interface AuthorityViewer {
  userId: string;
  memberships: ViewerMembership[];
  /** True if any membership is an authority admin. */
  isAdmin: boolean;
  /** Authorities this person belongs to in any capacity. */
  authorityIds: string[];
  /** Departments this person may open. */
  departmentIds: string[];
}

/** Builds the derived scope fields from a set of membership rows. */
export function buildViewer(
  userId: string,
  memberships: ViewerMembership[],
): AuthorityViewer {
  return {
    userId,
    memberships,
    isAdmin: memberships.some((m) => m.accessType === "authority_admin"),
    authorityIds: [...new Set(memberships.map((m) => m.authorityId))],
    departmentIds: [
      ...new Set(
        memberships
          .map((m) => m.departmentId)
          .filter((id): id is string => id !== null),
      ),
    ],
  };
}

/** The admin membership row, for attributing actions an admin takes. */
export function adminMembership(viewer: AuthorityViewer): ViewerMembership | null {
  return viewer.memberships.find((m) => m.accessType === "authority_admin") ?? null;
}

/** Whether the viewer administers a specific authority. */
export function isAdminOf(viewer: AuthorityViewer, authorityId: string): boolean {
  return viewer.memberships.some(
    (m) => m.accessType === "authority_admin" && m.authorityId === authorityId,
  );
}

/**
 * Whether the viewer may open a department.
 *
 * An admin may open any department of an authority THEY administer — being an
 * admin somewhere is not being an admin everywhere. A member may open only the
 * departments they actually belong to.
 */
export function canAccessDepartment(
  viewer: AuthorityViewer,
  departmentAuthorityId: string,
  departmentId: string,
): boolean {
  if (isAdminOf(viewer, departmentAuthorityId)) return true;
  return viewer.departmentIds.includes(departmentId);
}

/**
 * Whether the viewer may open an issue.
 *
 * An unrouted issue (no department yet) is admin-only on purpose: until it is
 * assigned, no department owns it, and showing it to every department would
 * leak work across the boundaries the rest of this file exists to hold.
 */
export function canAccessIssue(
  viewer: AuthorityViewer,
  issue: { authorityId: string; departmentId: string | null },
): boolean {
  if (isAdminOf(viewer, issue.authorityId)) return true;
  if (!issue.departmentId) return false;
  return viewer.departmentIds.includes(issue.departmentId);
}

/**
 * Whether a private conversation is readable, given its participant list.
 *
 * Being an authority admin is deliberately NOT a way in. If it were, "private"
 * would only mean "private from your colleagues", which is not what anyone
 * choosing it would understand it to mean. An admin who needs the context asks
 * to be added, like anyone else.
 */
export function canAccessPrivateConversation(
  viewer: AuthorityViewer,
  participantMemberIds: string[],
): boolean {
  return viewer.memberships.some((m) => participantMemberIds.includes(m.memberId));
}

/**
 * The viewer's member row for an issue — who they are "acting as" when they
 * post a message or change a status there.
 *
 * A department membership wins over an admin one, so an admin who also works
 * in a department appears under the identity their colleagues know them by.
 */
export function actingMembership(
  viewer: AuthorityViewer,
  issue: { authorityId: string; departmentId: string | null },
): ViewerMembership | null {
  const inDepartment = issue.departmentId
    ? viewer.memberships.find((m) => m.departmentId === issue.departmentId)
    : undefined;
  if (inDepartment) return inDepartment;

  return (
    viewer.memberships.find(
      (m) => m.accessType === "authority_admin" && m.authorityId === issue.authorityId,
    ) ?? null
  );
}
