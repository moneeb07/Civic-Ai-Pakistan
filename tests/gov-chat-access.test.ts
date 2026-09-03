import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canPostInThread, canSeePrivateThread } from "../src/lib/gov/chat-access";

/*
 * The chat layer is deliberately flat: role decides who administers a
 * department, never who may speak in it. These tests pin both halves of that —
 * that participation is the only gate on a private thread, and that no rank
 * check ever creeps into posting.
 */
describe("canSeePrivateThread", () => {
  it("lets a participant in", () => {
    assert.equal(canSeePrivateThread("officer-ali", ["officer-ali", "officer-sara"]), true);
  });

  it("keeps a non-participant out, even inside the same department", () => {
    assert.equal(canSeePrivateThread("officer-bilal", ["officer-ali", "officer-sara"]), false);
  });

  /*
   * The rule people are most surprised to find enforced. If seniority granted
   * access, "private" would only mean "private from your peers".
   */
  it("does not admit a department head or platform admin by rank", () => {
    // The function takes no role at all — there is no argument through which
    // seniority could be smuggled in. Membership is the entire test.
    assert.equal(canSeePrivateThread("officer-dept-head", ["officer-ali"]), false);
    assert.equal(canSeePrivateThread("officer-platform-admin", ["officer-ali"]), false);
  });

  it("refuses everyone when the thread has no participants", () => {
    assert.equal(canSeePrivateThread("officer-ali", []), false);
  });
});

describe("canPostInThread", () => {
  it("never gates posting on rank", () => {
    // A member answering a dept head is the ordinary case, not an exception.
    assert.equal(canPostInThread(), true);
  });
});
