import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acceptInviteSchema,
  chatMessageSchema,
  advanceStageSchema,
  createDepartmentSchema,
  createInviteSchema,
  createOrganizationSchema,
  DEFAULT_WORKFLOW_STAGES,
  rateComplaintSchema,
  routeComplaintSchema,
  workflowSchema,
} from "../src/lib/gov/schema";

/*
 * The government API's boundary. Every route handler runs .safeParse on the
 * request body before touching the database, so a rule that isn't enforced
 * here isn't enforced anywhere — these tests are checking the actual gate.
 */

describe("createOrganizationSchema", () => {
  it("accepts a well-formed organization", () => {
    const result = createOrganizationSchema.safeParse({
      name: "Capital Development Authority",
      code: "CDA",
    });
    assert.equal(result.success, true);
  });

  it("rejects a lowercase or punctuated code — it appears in invite emails and URLs", () => {
    assert.equal(createOrganizationSchema.safeParse({ name: "Valid", code: "cda" }).success, false);
    assert.equal(createOrganizationSchema.safeParse({ name: "Valid", code: "C-DA" }).success, false);
  });

  it("rejects an empty name", () => {
    assert.equal(createOrganizationSchema.safeParse({ name: "", code: "CDA" }).success, false);
  });
});

describe("createDepartmentSchema", () => {
  it("accepts categories drawn from the citizen side's fixed list", () => {
    const result = createDepartmentSchema.safeParse({
      orgId: "org-1",
      name: "Roads",
      handlesCategories: ["POTHOLE", "ROAD_DAMAGE"],
    });
    assert.equal(result.success, true);
  });

  it("rejects a category the citizen app can never produce", () => {
    const result = createDepartmentSchema.safeParse({
      orgId: "org-1",
      name: "Roads",
      handlesCategories: ["SPACE_DEBRIS"],
    });
    assert.equal(result.success, false);
  });

  it("defaults to no categories rather than failing", () => {
    const result = createDepartmentSchema.safeParse({ orgId: "org-1", name: "Roads" });
    assert.equal(result.success, true);
    assert.deepEqual(result.success && result.data.handlesCategories, []);
  });
});

describe("createInviteSchema", () => {
  it("lowercases the email so two invites can't differ only by case", () => {
    const result = createInviteSchema.safeParse({
      email: "Officer@Example.GOV.PK",
      role: "member",
      orgId: "org-1",
      deptId: "dept-1",
    });
    assert.equal(result.success, true);
    assert.equal(result.success && result.data.email, "officer@example.gov.pk");
  });

  it("rejects a role outside the fixed four", () => {
    const result = createInviteSchema.safeParse({ email: "a@b.pk", role: "superuser" });
    assert.equal(result.success, false);
  });

  it("rejects a malformed email", () => {
    assert.equal(createInviteSchema.safeParse({ email: "not-an-email", role: "member" }).success, false);
  });
});

describe("acceptInviteSchema", () => {
  it("accepts a matching password pair", () => {
    const result = acceptInviteSchema.safeParse({
      name: "Ayesha Khan",
      password: "correct-horse",
      confirmPassword: "correct-horse",
    });
    assert.equal(result.success, true);
  });

  it("rejects mismatched passwords, with the error on the confirm field", () => {
    const result = acceptInviteSchema.safeParse({
      name: "Ayesha Khan",
      password: "correct-horse",
      confirmPassword: "correct-hors",
    });
    assert.equal(result.success, false);
    assert.deepEqual(
      result.success ? [] : result.error.issues.map((issue) => issue.path.join(".")),
      ["confirmPassword"],
    );
  });

  it("rejects a password under 8 characters", () => {
    const result = acceptInviteSchema.safeParse({
      name: "Ayesha Khan",
      password: "short",
      confirmPassword: "short",
    });
    assert.equal(result.success, false);
  });
});

describe("workflowSchema", () => {
  const base = {
    name: "Stage",
    description: null,
    requiresPhoto: false,
    requiresNote: false,
    slaHours: null,
    isTerminal: false,
  };

  it("accepts the seeded default template", () => {
    const result = workflowSchema.safeParse({ stages: DEFAULT_WORKFLOW_STAGES });
    assert.equal(result.success, true);
  });

  it("rejects a workflow with no terminal stage — nothing could ever be resolved", () => {
    const result = workflowSchema.safeParse({
      stages: [
        { ...base, name: "New" },
        { ...base, name: "In Progress" },
      ],
    });
    assert.equal(result.success, false);
    assert.match(
      result.success ? "" : result.error.issues.map((i) => i.message).join(" "),
      /which stage means the complaint is resolved/i,
    );
  });

  it("rejects two terminal stages — resolution must be unambiguous", () => {
    const result = workflowSchema.safeParse({
      stages: [
        { ...base, name: "Done A", isTerminal: true },
        { ...base, name: "Done B", isTerminal: true },
      ],
    });
    assert.equal(result.success, false);
    assert.match(
      result.success ? "" : result.error.issues.map((i) => i.message).join(" "),
      /Only one stage can be the resolved stage/i,
    );
  });

  it("rejects a workflow that is only its terminal stage", () => {
    const result = workflowSchema.safeParse({
      stages: [
        { ...base, name: "Resolved", isTerminal: true },
        { ...base, name: "Also Resolved", isTerminal: true },
      ],
    });
    assert.equal(result.success, false);
  });

  it("rejects duplicate stage names, case-insensitively", () => {
    const result = workflowSchema.safeParse({
      stages: [
        { ...base, name: "Review" },
        { ...base, name: "  review  " },
        { ...base, name: "Resolved", isTerminal: true },
      ],
    });
    assert.equal(result.success, false);
    assert.match(
      result.success ? "" : result.error.issues.map((i) => i.message).join(" "),
      /same name/i,
    );
  });

  it("rejects fewer than two stages", () => {
    const result = workflowSchema.safeParse({
      stages: [{ ...base, name: "Resolved", isTerminal: true }],
    });
    assert.equal(result.success, false);
  });

  it("rejects an SLA of zero or a negative number of hours", () => {
    const result = workflowSchema.safeParse({
      stages: [
        { ...base, name: "New", slaHours: 0 },
        { ...base, name: "Resolved", isTerminal: true },
      ],
    });
    assert.equal(result.success, false);
  });
});

describe("advanceStageSchema", () => {
  it("accepts an empty body — a stage with no requirements needs nothing", () => {
    assert.equal(advanceStageSchema.safeParse({}).success, true);
  });

  it("rejects a photo value that isn't a URL", () => {
    assert.equal(advanceStageSchema.safeParse({ photoUrl: "not a url" }).success, false);
  });

  it("rejects a whitespace-only note rather than saving an empty one", () => {
    assert.equal(advanceStageSchema.safeParse({ note: "   " }).success, false);
  });
});

describe("rateComplaintSchema", () => {
  it("accepts 1 through 5", () => {
    for (const stars of [1, 2, 3, 4, 5]) {
      assert.equal(rateComplaintSchema.safeParse({ stars }).success, true, `stars=${stars}`);
    }
  });

  it("rejects 0, 6 and fractional ratings", () => {
    assert.equal(rateComplaintSchema.safeParse({ stars: 0 }).success, false);
    assert.equal(rateComplaintSchema.safeParse({ stars: 6 }).success, false);
    assert.equal(rateComplaintSchema.safeParse({ stars: 4.5 }).success, false);
  });
});

describe("routeComplaintSchema", () => {
  it("requires a destination department", () => {
    assert.equal(routeComplaintSchema.safeParse({}).success, false);
    assert.equal(routeComplaintSchema.safeParse({ deptId: "dept-1" }).success, true);
  });
});

describe("chatMessageSchema", () => {
  it("accepts an ordinary message", () => {
    const result = chatMessageSchema.safeParse({ body: "Inspected the site this morning." });
    assert.equal(result.success, true);
  });

  it("trims surrounding whitespace rather than storing it", () => {
    const result = chatMessageSchema.safeParse({ body: "  on my way  " });
    assert.equal(result.success, true);
    assert.equal(result.success && result.data.body, "on my way");
  });

  it("rejects an empty or whitespace-only message", () => {
    // A stray Enter must not put a blank line into the record of how a public
    // complaint was handled.
    assert.equal(chatMessageSchema.safeParse({ body: "" }).success, false);
    assert.equal(chatMessageSchema.safeParse({ body: "   \n  " }).success, false);
  });

  it("keeps deliberate internal line breaks", () => {
    const result = chatMessageSchema.safeParse({ body: "Two things:\n1. depth\n2. width" });
    assert.equal(result.success, true);
    assert.equal(result.success && result.data.body.split("\n").length, 3);
  });

  it("rejects a message beyond the 4000-character ceiling", () => {
    assert.equal(chatMessageSchema.safeParse({ body: "x".repeat(4001) }).success, false);
    assert.equal(chatMessageSchema.safeParse({ body: "x".repeat(4000) }).success, true);
  });

  it("rejects a missing body outright", () => {
    assert.equal(chatMessageSchema.safeParse({}).success, false);
  });
});
