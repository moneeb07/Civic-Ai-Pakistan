import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  actingMembership,
  buildViewer,
  canAccessDepartment,
  canAccessIssue,
  canAccessPrivateConversation,
  isAdminOf,
  type ViewerMembership,
} from "../src/lib/authority/permissions";

const CDA = "auth-cda";
const OTHER_AUTHORITY = "auth-lda";
const WATER = "dept-water";
const ROADS = "dept-roads";

function membership(over: Partial<ViewerMembership>): ViewerMembership {
  return {
    memberId: "m-1",
    memberCode: "CDA-10001",
    displayName: "Ali Raza",
    accessType: "department_member",
    authorityId: CDA,
    authorityCode: "CDA",
    authorityName: "CDA",
    departmentId: WATER,
    departmentName: "Water Management",
    ...over,
  };
}

const waterMember = buildViewer("u-ali", [membership({})]);
const cdaAdmin = buildViewer("u-nadia", [
  membership({
    memberId: "m-admin",
    accessType: "authority_admin",
    departmentId: null,
    departmentName: null,
    displayName: "Nadia Sheikh",
  }),
]);
const otherAdmin = buildViewer("u-other", [
  membership({
    memberId: "m-other",
    accessType: "authority_admin",
    authorityId: OTHER_AUTHORITY,
    departmentId: null,
    departmentName: null,
  }),
]);

describe("buildViewer", () => {
  it("derives admin status and scope from the membership rows", () => {
    assert.equal(waterMember.isAdmin, false);
    assert.deepEqual(waterMember.departmentIds, [WATER]);
    assert.equal(cdaAdmin.isAdmin, true);
    // An admin has no department row, so no department scope of their own.
    assert.deepEqual(cdaAdmin.departmentIds, []);
  });

  it("collects every department for someone in more than one", () => {
    const both = buildViewer("u-multi", [
      membership({ memberId: "m-a", departmentId: WATER }),
      membership({ memberId: "m-b", departmentId: ROADS, departmentName: "Roads" }),
    ]);

    assert.deepEqual(both.departmentIds.sort(), [ROADS, WATER].sort());
  });
});

describe("canAccessDepartment", () => {
  it("lets a member open their own department", () => {
    assert.equal(canAccessDepartment(waterMember, CDA, WATER), true);
  });

  it("refuses a member another department in the same authority", () => {
    assert.equal(canAccessDepartment(waterMember, CDA, ROADS), false);
  });

  it("lets an admin open any department of their own authority", () => {
    assert.equal(canAccessDepartment(cdaAdmin, CDA, WATER), true);
    assert.equal(canAccessDepartment(cdaAdmin, CDA, ROADS), true);
  });

  /*
   * Being an admin somewhere is not being an admin everywhere. Without this,
   * anyone who administers any authority could read every other authority's
   * work.
   */
  it("refuses an admin a department belonging to a different authority", () => {
    assert.equal(canAccessDepartment(otherAdmin, CDA, WATER), false);
  });
});

describe("canAccessIssue", () => {
  const waterIssue = { authorityId: CDA, departmentId: WATER };
  const roadIssue = { authorityId: CDA, departmentId: ROADS };
  const unrouted = { authorityId: CDA, departmentId: null };

  it("lets a member open an issue in their department", () => {
    assert.equal(canAccessIssue(waterMember, waterIssue), true);
  });

  it("refuses a member an issue belonging to another department", () => {
    assert.equal(canAccessIssue(waterMember, roadIssue), false);
  });

  it("lets an admin open any issue in their authority", () => {
    assert.equal(canAccessIssue(cdaAdmin, waterIssue), true);
    assert.equal(canAccessIssue(cdaAdmin, roadIssue), true);
  });

  it("refuses an admin an issue in a different authority", () => {
    assert.equal(canAccessIssue(otherAdmin, waterIssue), false);
  });

  /*
   * An unassigned issue has no owning department, so showing it to every
   * department would leak work across the boundary. It stays with the admin
   * until it is routed.
   */
  it("keeps an unrouted issue admin-only", () => {
    assert.equal(canAccessIssue(cdaAdmin, unrouted), true);
    assert.equal(canAccessIssue(waterMember, unrouted), false);
  });

  it("gives someone with no memberships nothing", () => {
    const nobody = buildViewer("u-none", []);
    assert.equal(canAccessIssue(nobody, waterIssue), false);
    assert.equal(canAccessDepartment(nobody, CDA, WATER), false);
    assert.equal(isAdminOf(nobody, CDA), false);
  });
});

describe("canAccessPrivateConversation", () => {
  it("lets a participant in", () => {
    assert.equal(canAccessPrivateConversation(waterMember, ["m-1", "m-9"]), true);
  });

  it("keeps a non-participant out even in their own department", () => {
    assert.equal(canAccessPrivateConversation(waterMember, ["m-7", "m-9"]), false);
  });

  /*
   * The rule people would be most surprised to find missing. If an admin could
   * read any private thread, "private" would only mean "private from your
   * colleagues" — so admins get in the same way as everyone else: by being
   * added.
   */
  it("does not let an authority admin in through the back door", () => {
    assert.equal(canAccessPrivateConversation(cdaAdmin, ["m-1", "m-9"]), false);
    assert.equal(canAccessPrivateConversation(cdaAdmin, ["m-admin"]), true);
  });

  it("refuses everyone when the participant list is empty", () => {
    assert.equal(canAccessPrivateConversation(waterMember, []), false);
    assert.equal(canAccessPrivateConversation(cdaAdmin, []), false);
  });
});

describe("actingMembership", () => {
  it("attributes a member's action to their department membership", () => {
    const acting = actingMembership(waterMember, {
      authorityId: CDA,
      departmentId: WATER,
    });
    assert.equal(acting?.memberId, "m-1");
  });

  it("falls back to the admin membership when they have no department row", () => {
    const acting = actingMembership(cdaAdmin, { authorityId: CDA, departmentId: WATER });
    assert.equal(acting?.memberId, "m-admin");
  });

  /*
   * Someone who both administers the authority and works in a department
   * should appear to colleagues under the identity they know, not as "admin".
   */
  it("prefers the department identity when a person has both", () => {
    const dual = buildViewer("u-dual", [
      membership({ memberId: "m-admin", accessType: "authority_admin", departmentId: null }),
      membership({ memberId: "m-dept", departmentId: WATER }),
    ]);

    const acting = actingMembership(dual, { authorityId: CDA, departmentId: WATER });
    assert.equal(acting?.memberId, "m-dept");
  });

  it("returns nobody when the viewer has no standing on the issue", () => {
    const acting = actingMembership(waterMember, {
      authorityId: OTHER_AUTHORITY,
      departmentId: "dept-elsewhere",
    });
    assert.equal(acting, null);
  });
});
