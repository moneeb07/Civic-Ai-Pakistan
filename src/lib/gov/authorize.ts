import type { OfficerDto, OfficerRole } from "./schema";
import { INVITABLE_ROLES } from "./schema";

/*
 * Every authorization decision the government portal makes, in one file.
 *
 * These are pure functions over plain data — no database, no request, no
 * session — for two reasons. They are unit-testable without a running
 * Postgres (see tests/gov-authorize.test.ts), and there is exactly one place
 * to read when asking "who is allowed to do this?", instead of the rule being
 * reconstructed from scattered `if (officer.role === ...)` checks.
 *
 * These decide *permission*. They are not the only defence: every store query
 * also carries its org/dept scope in the SQL WHERE clause, so a bug here
 * cannot by itself leak another department's complaint.
 */

/** The scope facts a complaint carries. Deliberately not the full DTO — authorization needs nothing else. */
export interface AssignmentScope {
  orgId: string;
  deptId: string;
  /**
   * Every officer currently assigned to the complaint.
   *
   * A list rather than a single id because a department head can put several
   * people on one problem. Empty means routed but not yet assigned.
   */
  assigneeIds: string[];
}

/** True when this officer is one of the people actually working the complaint. */
function isAssignee(officer: OfficerDto, assignment: AssignmentScope): boolean {
  return assignment.assigneeIds.includes(officer.id);
}

export function canManageOrg(officer: OfficerDto, orgId: string): boolean {
  if (officer.role === "platform_admin") return true;
  return officer.role === "org_head" && officer.orgId === orgId;
}

/**
 * `parentOrgId` is the organization the department belongs to. It is a
 * required argument rather than something looked up inside here so that this
 * stays pure — the caller has already loaded the department row it is acting
 * on, and passing the id it read is cheaper and more honest than a second query.
 */
export function canManageDept(
  officer: OfficerDto,
  deptId: string,
  parentOrgId: string,
): boolean {
  if (officer.role === "platform_admin") return true;
  if (officer.role === "org_head") return officer.orgId === parentOrgId;
  if (officer.role === "dept_head") return officer.deptId === deptId;
  return false;
}

/**
 * Who may open a complaint.
 *
 * A member sees only what is assigned to them: being in the department is not
 * a reason to read a colleague's caseload, and a complaint carries a citizen's
 * photo and location.
 */
export function canViewComplaint(officer: OfficerDto, assignment: AssignmentScope): boolean {
  if (officer.role === "platform_admin") return true;
  if (officer.role === "org_head") return officer.orgId === assignment.orgId;
  if (officer.role === "dept_head") return officer.deptId === assignment.deptId;
  if (officer.role === "member") {
    return officer.deptId === assignment.deptId && isAssignee(officer, assignment);
  }
  return false;
}

/**
 * Who may move a complaint to its next stage.
 *
 * Narrower than viewing on purpose: stage progress is a record of work
 * someone actually did, so only the officer doing it — or the dept head
 * accountable for the queue — can record it. A platform admin can read
 * everything and advance nothing.
 */
export function canAdvanceStage(officer: OfficerDto, assignment: AssignmentScope): boolean {
  if (officer.role === "dept_head") return officer.deptId === assignment.deptId;
  if (officer.role === "member") {
    return officer.deptId === assignment.deptId && isAssignee(officer, assignment);
  }
  return false;
}

/** Only the dept head accountable for the queue may put a resolved complaint back into it. */
export function canReopenComplaint(officer: OfficerDto, assignment: AssignmentScope): boolean {
  return officer.role === "dept_head" && officer.deptId === assignment.deptId;
}

/** Routing an unassigned complaint into a department is the organization head's job. */
export function canRouteComplaint(officer: OfficerDto, orgId: string): boolean {
  if (officer.role === "platform_admin") return true;
  return officer.role === "org_head" && officer.orgId === orgId;
}

/** Assigning a routed complaint to a specific person is the department head's job. */
export function canAssignComplaint(officer: OfficerDto, assignment: AssignmentScope): boolean {
  if (officer.role === "platform_admin") return true;
  return officer.role === "dept_head" && officer.deptId === assignment.deptId;
}

export interface InviteTarget {
  role: OfficerRole;
  orgId: string | null;
  deptId: string | null;
}

/**
 * Whether `officer` may create this exact invite.
 *
 * Checks the role pair AND the scope: an org head inviting a dept head into
 * someone else's organization is refused, not silently rewritten to their own.
 * Returns a reason code rather than a boolean so the route can answer with
 * something the UI can explain.
 */
export function canInvite(
  officer: OfficerDto,
  target: InviteTarget,
): { allowed: true } | { allowed: false; reason: "role_not_permitted" | "out_of_scope" | "scope_missing" } {
  if (!INVITABLE_ROLES[officer.role].includes(target.role)) {
    return { allowed: false, reason: "role_not_permitted" };
  }

  // The scope an invite grants must match the shape its role requires — the
  // same rule the officer_role_scope_check constraint enforces in the database.
  if (target.role === "platform_admin") {
    if (target.orgId !== null || target.deptId !== null) {
      return { allowed: false, reason: "out_of_scope" };
    }
  } else if (target.role === "org_head") {
    if (!target.orgId || target.deptId !== null) {
      return { allowed: false, reason: "scope_missing" };
    }
  } else if (!target.orgId || !target.deptId) {
    return { allowed: false, reason: "scope_missing" };
  }

  if (officer.role === "platform_admin") return { allowed: true };

  if (officer.role === "org_head") {
    return target.orgId === officer.orgId
      ? { allowed: true }
      : { allowed: false, reason: "out_of_scope" };
  }

  if (officer.role === "dept_head") {
    return target.orgId === officer.orgId && target.deptId === officer.deptId
      ? { allowed: true }
      : { allowed: false, reason: "out_of_scope" };
  }

  return { allowed: false, reason: "role_not_permitted" };
}

// -- Chat ---------------------------------------------------------------------

/*
 * Every complaint has one group chat, and its membership is derived from who is
 * currently responsible for the work rather than stored: the organization's
 * head, the head of the department it was routed to, and everyone assigned to
 * it. That is exactly the set of people the ticket describes, and deriving it
 * means adding a second assignee puts them in the room with no extra step.
 */

/**
 * Whether this officer is a participant — i.e. may POST.
 *
 * A platform admin is deliberately absent. They can read any complaint for
 * oversight, but they are not part of the working group and putting them in
 * every conversation in the country would change what people are willing to
 * say in it.
 */
export function isChatParticipant(officer: OfficerDto, assignment: AssignmentScope): boolean {
  if (officer.role === "org_head") return officer.orgId === assignment.orgId;
  if (officer.role === "dept_head") return officer.deptId === assignment.deptId;
  if (officer.role === "member") {
    return officer.deptId === assignment.deptId && isAssignee(officer, assignment);
  }
  return false;
}

/**
 * Who may READ the transcript.
 *
 * Deliberately the same rule as viewing the complaint: if the chat were
 * readable by anyone who could not open the complaint it discusses, it would
 * be a second, looser access path to the same case. A platform admin can
 * therefore read but not post.
 */
export function canReadChat(officer: OfficerDto, assignment: AssignmentScope): boolean {
  return canViewComplaint(officer, assignment);
}

/** Who may post. Participants only — reading for oversight is not taking part. */
export function canPostToChat(officer: OfficerDto, assignment: AssignmentScope): boolean {
  return isChatParticipant(officer, assignment);
}

/** Adding and removing the people working a complaint is the department head's call. */
export function canManageAssignees(officer: OfficerDto, assignment: AssignmentScope): boolean {
  if (officer.role === "platform_admin") return true;
  return officer.role === "dept_head" && officer.deptId === assignment.deptId;
}
