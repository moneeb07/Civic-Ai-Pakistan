import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canAdvanceStage,
  canAssignComplaint,
  canInvite,
  canManageDept,
  canManageOrg,
  canReopenComplaint,
  canRouteComplaint,
  canViewComplaint,
  type AssignmentScope,
} from "../src/lib/gov/authorize";
import type { OfficerDto, OfficerRole } from "../src/lib/gov/schema";

/*
 * Authorization is the government portal's whole security model, so these are
 * the tests that matter most. Every case below is a "can officer A touch
 * department B's complaint" question — the exact question a bug here would
 * answer wrongly.
 */

function officer(
  role: OfficerRole,
  overrides: Partial<OfficerDto> = {},
): OfficerDto {
  return {
    id: "officer-1",
    userId: "user-1",
    name: "Test Officer",
    email: "officer@example.gov.pk",
    role,
    orgId: role === "platform_admin" ? null : "org-1",
    orgName: null,
    deptId: role === "platform_admin" || role === "org_head" ? null : "dept-1",
    deptName: null,
    ...overrides,
  };
}

const ownScope: AssignmentScope = {
  orgId: "org-1",
  deptId: "dept-1",
  assignedOfficerId: "officer-1",
};

const colleagueScope: AssignmentScope = {
  orgId: "org-1",
  deptId: "dept-1",
  assignedOfficerId: "officer-2",
};

const otherDeptScope: AssignmentScope = {
  orgId: "org-1",
  deptId: "dept-2",
  assignedOfficerId: "officer-3",
};

const otherOrgScope: AssignmentScope = {
  orgId: "org-2",
  deptId: "dept-9",
  assignedOfficerId: "officer-9",
};

describe("canManageOrg", () => {
  it("lets a platform admin manage any organization", () => {
    assert.equal(canManageOrg(officer("platform_admin"), "org-any"), true);
  });

  it("lets an org head manage only their own", () => {
    assert.equal(canManageOrg(officer("org_head"), "org-1"), true);
    assert.equal(canManageOrg(officer("org_head"), "org-2"), false);
  });

  it("refuses a dept head and a member", () => {
    assert.equal(canManageOrg(officer("dept_head"), "org-1"), false);
    assert.equal(canManageOrg(officer("member"), "org-1"), false);
  });
});

describe("canManageDept", () => {
  it("lets the parent organization's head manage a department", () => {
    assert.equal(canManageDept(officer("org_head"), "dept-1", "org-1"), true);
  });

  it("refuses an org head from a different organization", () => {
    assert.equal(canManageDept(officer("org_head"), "dept-1", "org-2"), false);
  });

  it("lets a dept head manage only their own department", () => {
    assert.equal(canManageDept(officer("dept_head"), "dept-1", "org-1"), true);
    assert.equal(canManageDept(officer("dept_head"), "dept-2", "org-1"), false);
  });

  it("refuses a member outright — defining the workflow is not their job", () => {
    assert.equal(canManageDept(officer("member"), "dept-1", "org-1"), false);
  });
});

describe("canViewComplaint", () => {
  it("lets a platform admin view anything", () => {
    assert.equal(canViewComplaint(officer("platform_admin"), otherOrgScope), true);
  });

  it("scopes an org head to their own organization", () => {
    assert.equal(canViewComplaint(officer("org_head"), otherDeptScope), true);
    assert.equal(canViewComplaint(officer("org_head"), otherOrgScope), false);
  });

  it("scopes a dept head to their own department", () => {
    assert.equal(canViewComplaint(officer("dept_head"), colleagueScope), true);
    assert.equal(canViewComplaint(officer("dept_head"), otherDeptScope), false);
  });

  it("shows a member only what is assigned to them, not a colleague's caseload", () => {
    assert.equal(canViewComplaint(officer("member"), ownScope), true);
    assert.equal(canViewComplaint(officer("member"), colleagueScope), false);
  });
});

describe("canAdvanceStage", () => {
  it("lets the assigned member advance their own complaint", () => {
    assert.equal(canAdvanceStage(officer("member"), ownScope), true);
  });

  it("refuses a member on a colleague's complaint", () => {
    assert.equal(canAdvanceStage(officer("member"), colleagueScope), false);
  });

  it("lets the dept head advance anything in their department", () => {
    assert.equal(canAdvanceStage(officer("dept_head"), colleagueScope), true);
  });

  it("refuses a platform admin — they can read everything and do nothing", () => {
    assert.equal(canAdvanceStage(officer("platform_admin"), ownScope), false);
  });

  it("refuses an org head — advancing is department work", () => {
    assert.equal(canAdvanceStage(officer("org_head"), ownScope), false);
  });
});

describe("canReopenComplaint", () => {
  it("is the dept head's decision alone", () => {
    assert.equal(canReopenComplaint(officer("dept_head"), colleagueScope), true);
    assert.equal(canReopenComplaint(officer("member"), ownScope), false);
    assert.equal(canReopenComplaint(officer("org_head"), ownScope), false);
    assert.equal(canReopenComplaint(officer("platform_admin"), ownScope), false);
  });

  it("refuses a dept head from another department", () => {
    assert.equal(canReopenComplaint(officer("dept_head"), otherDeptScope), false);
  });
});

describe("canRouteComplaint / canAssignComplaint", () => {
  it("routing belongs to the organization head", () => {
    assert.equal(canRouteComplaint(officer("org_head"), "org-1"), true);
    assert.equal(canRouteComplaint(officer("org_head"), "org-2"), false);
    assert.equal(canRouteComplaint(officer("dept_head"), "org-1"), false);
  });

  it("assigning belongs to the department head", () => {
    assert.equal(canAssignComplaint(officer("dept_head"), colleagueScope), true);
    assert.equal(canAssignComplaint(officer("dept_head"), otherDeptScope), false);
    assert.equal(canAssignComplaint(officer("member"), ownScope), false);
  });
});

describe("canInvite", () => {
  it("lets a platform admin invite an org head into any organization", () => {
    const result = canInvite(officer("platform_admin"), {
      role: "org_head",
      orgId: "org-7",
      deptId: null,
    });
    assert.equal(result.allowed, true);
  });

  it("lets an org head invite a dept head into their own organization", () => {
    const result = canInvite(officer("org_head"), {
      role: "dept_head",
      orgId: "org-1",
      deptId: "dept-1",
    });
    assert.equal(result.allowed, true);
  });

  it("refuses an org head inviting into another organization", () => {
    const result = canInvite(officer("org_head"), {
      role: "dept_head",
      orgId: "org-2",
      deptId: "dept-5",
    });
    assert.deepEqual(result, { allowed: false, reason: "out_of_scope" });
  });

  it("refuses an org head trying to mint another org head — no privilege escalation sideways", () => {
    const result = canInvite(officer("org_head"), {
      role: "org_head",
      orgId: "org-1",
      deptId: null,
    });
    assert.deepEqual(result, { allowed: false, reason: "role_not_permitted" });
  });

  it("refuses a dept head trying to mint a dept head", () => {
    const result = canInvite(officer("dept_head"), {
      role: "dept_head",
      orgId: "org-1",
      deptId: "dept-1",
    });
    assert.deepEqual(result, { allowed: false, reason: "role_not_permitted" });
  });

  it("lets a dept head invite a member into their own department only", () => {
    assert.equal(
      canInvite(officer("dept_head"), { role: "member", orgId: "org-1", deptId: "dept-1" }).allowed,
      true,
    );
    assert.equal(
      canInvite(officer("dept_head"), { role: "member", orgId: "org-1", deptId: "dept-2" }).allowed,
      false,
    );
  });

  it("refuses a member inviting anyone at all", () => {
    const result = canInvite(officer("member"), {
      role: "member",
      orgId: "org-1",
      deptId: "dept-1",
    });
    assert.deepEqual(result, { allowed: false, reason: "role_not_permitted" });
  });

  it("rejects a scope shape the officer_role_scope_check constraint would reject too", () => {
    // A platform_admin invite must carry no scope at all.
    assert.deepEqual(
      canInvite(officer("platform_admin"), {
        role: "platform_admin",
        orgId: "org-1",
        deptId: null,
      }),
      { allowed: false, reason: "out_of_scope" },
    );

    // An org_head invite needs an org and must not carry a department.
    assert.deepEqual(
      canInvite(officer("platform_admin"), { role: "org_head", orgId: null, deptId: null }),
      { allowed: false, reason: "scope_missing" },
    );

    // A member invite needs both.
    assert.deepEqual(
      canInvite(officer("platform_admin"), { role: "member", orgId: "org-1", deptId: null }),
      { allowed: false, reason: "scope_missing" },
    );
  });
});
