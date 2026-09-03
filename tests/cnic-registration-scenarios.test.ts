import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideExtraction, type DecisionInput } from "../src/lib/cnic-decision";
import { ADDRESS_CONFIDENCE_MIN } from "../src/lib/cnic-confidence";
import { planRetake } from "../src/lib/registration/retake";

/*
 * Every situation a citizen can actually walk into during CNIC registration,
 * driven through the real decision pipeline and the real retake planner —
 * the same two modules the API route and the identity flow call.
 *
 * These are written as SCENARIOS rather than unit tests because the defects
 * that reached a real person were never inside one function. They were in the
 * handoffs: a gate verdict the retake planner misread, a retake plan the flow
 * half-applied, a passing read whose missing address nobody accounted for.
 * Each block below is a sequence, and several assert what happens on the
 * SECOND attempt, because that is where the bugs lived.
 */

/** A clean, confident front-and-back read. Individual tests spoil what they test. */
function goodScan(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    readable: true,
    frontReadable: true,
    backReadable: true,
    frontImageSide: "front",
    backImageSide: "back",
    confidence: 0.95,
    fieldConfidence: {
      fullName: 0.95,
      fatherName: 0.9,
      cnicNumber: 0.96,
      dateOfBirth: 0.9,
      gender: 0.95,
    },
    values: {
      fullName: "Ahmed Nawaz",
      fatherName: "Muhammad Nawaz",
      cnicNumber: "35202-1234567-1",
      dateOfBirth: "01.01.1990",
      gender: "Male",
    },
    backScanned: true,
    presentAddress: {
      raw: "مکان نمبر 123، گلی نمبر 5، محلہ رحمان پورہ، ملتان",
      houseNumber: "123",
      streetOrMohalla: "گلی نمبر 5",
      sector: null,
      district: "ملتان",
      city: "ملتان",
      confidence: 0.9,
    },
    permanentAddress: null,
    addressConfidenceMin: ADDRESS_CONFIDENCE_MIN,
    ...overrides,
  };
}

const EMPTY_ADDRESS = {
  raw: null,
  houseNumber: null,
  streetOrMohalla: null,
  sector: null,
  district: null,
  city: null,
  confidence: 0,
};

// ===========================================================================
describe("Scenario: everything works", () => {
  it("accepts a clean two-sided scan and reports the address as available", () => {
    const decision = decideExtraction(goodScan());

    assert.equal(decision.kind, "accepted");
    if (decision.kind !== "accepted") return;

    assert.equal(decision.addressOutcome, "available");
    assert.equal(decision.addressNeedsManualEntry, false);
    assert.ok(decision.presentAddress, "the address must survive to the citizen");
    assert.ok(decision.acceptedFields.includes("cnicNumber"));
    assert.ok(decision.acceptedFields.includes("fullName"));
  });
});

// ===========================================================================
/*
 * The reported bug, in full.
 *
 * Attempt 1: both photos are poor, so the read is rejected. Attempt 2 must ask
 * for BOTH sides again. The old code kept the unreadable back, sent the
 * citizen to the front camera only, then immediately re-submitted the new
 * front against that same bad back — so the back camera was never shown again
 * and the address, which is printed on the back, could never be read no matter
 * how many times they tried.
 */
describe("Scenario: both photos are unreadable, then the citizen retries", () => {
  const decision = decideExtraction(
    goodScan({
      readable: false,
      frontReadable: false,
      backReadable: false,
      confidence: 0.2,
    }),
  );

  it("rejects the read and blames both sides", () => {
    assert.equal(decision.kind, "rejected");
    if (decision.kind !== "rejected") return;
    assert.equal(decision.affectedSide, "both");
  });

  it("the retry asks for the front AND the back — not the front alone", () => {
    if (decision.kind !== "rejected") throw new Error("expected a rejection");

    const plan = planRetake(decision.affectedSide, { front: true, back: true });

    assert.equal(plan.retake, "front", "the flow restarts at the front");
    assert.equal(plan.keeps, null, "nothing may be re-used");
    assert.deepEqual(
      [...plan.discards].sort(),
      ["back", "front"],
      "both photos must be thrown away, or the retry re-sends the bad back",
    );
  });

  it("simulating the flow: the citizen reaches the back camera on attempt 2", () => {
    if (decision.kind !== "rejected") throw new Error("expected a rejection");

    // The identity flow's own state, reproduced exactly.
    let front: string | null = "bad-front";
    let back: string | null = "bad-back";

    const plan = planRetake(decision.affectedSide, {
      front: Boolean(front),
      back: Boolean(back),
    });
    for (const side of plan.discards) {
      if (side === "front") front = null;
      else back = null;
    }
    const retakeTarget = plan.keeps ? plan.retake : null;

    // The citizen photographs the front again.
    front = "new-front";

    /*
     * The flow re-extracts immediately only when it is replacing exactly one
     * side AND the other is still on file. Here it must instead advance to the
     * back camera — which is the entire fix.
     */
    const reExtractsImmediately = retakeTarget === "front" && back !== null;

    assert.equal(
      reExtractsImmediately,
      false,
      "attempt 2 must not silently re-use the old back",
    );
    assert.equal(back, null, "the unreadable back must have been discarded");
  });
});

// ===========================================================================
/*
 * The counterpart. "unknown" is the model saying nothing about either side,
 * NOT condemning both. A back it never complained about must survive, or a
 * citizen is sent to re-photograph a side that was fine.
 */
describe("Scenario: the read fails but neither side is implicated", () => {
  it("keeps the back and retakes only the front", () => {
    const decision = decideExtraction(
      goodScan({ confidence: 0.4, frontReadable: null, backReadable: null }),
    );

    assert.equal(decision.kind, "rejected");
    if (decision.kind !== "rejected") return;
    assert.equal(decision.affectedSide, "unknown");

    const plan = planRetake(decision.affectedSide, { front: true, back: true });
    assert.equal(plan.keeps, "back");
    assert.deepEqual(plan.discards, ["front"]);
  });
});

// ===========================================================================
describe("Scenario: only one side is bad", () => {
  it("a blurred back sends the citizen to the back camera, keeping the front", () => {
    const decision = decideExtraction(
      goodScan({ readable: false, frontReadable: true, backReadable: false }),
    );

    assert.equal(decision.kind, "rejected");
    if (decision.kind !== "rejected") return;
    assert.equal(decision.affectedSide, "back");

    const plan = planRetake(decision.affectedSide, { front: true, back: true });
    assert.deepEqual(plan, { retake: "back", keeps: "front", discards: ["back"] });
  });

  it("a blurred front sends the citizen to the front camera, keeping the back", () => {
    const decision = decideExtraction(
      goodScan({ readable: false, frontReadable: false, backReadable: true }),
    );

    assert.equal(decision.kind, "rejected");
    if (decision.kind !== "rejected") return;
    assert.equal(decision.affectedSide, "front");

    const plan = planRetake(decision.affectedSide, { front: true, back: true });
    assert.deepEqual(plan, { retake: "front", keeps: "back", discards: ["front"] });
  });
});

// ===========================================================================
/*
 * The silent one. A perfectly sharp photograph of the WRONG side produces a
 * confident, correct, address-less read that passes every accuracy check.
 * Without a side check the citizen is shown a successful scan with a blank
 * address and no reason — and retrying cannot help, because nothing has
 * noticed which side is in the picture.
 */
describe("Scenario: the citizen photographs the front twice", () => {
  const decision = decideExtraction(
    goodScan({
      backImageSide: "front",
      // The read is otherwise flawless — this is the point.
      presentAddress: null,
      permanentAddress: null,
    }),
  );

  it("is caught as a wrong-side mistake, not passed off as a successful scan", () => {
    assert.equal(decision.kind, "wrong_side");
    if (decision.kind !== "wrong_side") return;
    assert.equal(decision.failure, "same_side_twice");
  });

  it("asks only for the back, keeping the good front", () => {
    if (decision.kind !== "wrong_side") throw new Error("expected a wrong-side result");
    assert.equal(decision.retake, "back");

    const plan = planRetake(decision.retake, { front: true, back: true });
    assert.equal(plan.keeps, "front", "a good front must not be re-photographed");
    assert.deepEqual(plan.discards, ["back"]);
  });
});

describe("Scenario: the citizen shows the back when asked for the front", () => {
  /*
   * Both photos are in the wrong slot. Retaking only the front would keep a
   * back-slot photo that is really a front, so the very next attempt would
   * fail as "the same side twice" — the citizen burns a round trip and is told
   * something different each time. The swap is named and both are retaken.
   */
  it("names a swap as a swap, and asks for both sides again", () => {
    const decision = decideExtraction(
      goodScan({ frontImageSide: "back", backImageSide: "front" }),
    );

    assert.equal(decision.kind, "wrong_side");
    if (decision.kind !== "wrong_side") return;
    assert.equal(decision.failure, "sides_swapped");
    assert.equal(decision.retake, "front");
    assert.equal(decision.retakeBoth, true);

    // The client turns retakeBoth into affectedSide "both", which discards both.
    const plan = planRetake("both", { front: true, back: true });
    assert.equal(plan.keeps, null);
    assert.deepEqual([...plan.discards].sort(), ["back", "front"]);
  });

  it("names a wrong front alone when the back slot is uncertain", () => {
    const decision = decideExtraction(
      goodScan({ frontImageSide: "back", backImageSide: "unknown" }),
    );

    assert.equal(decision.kind, "wrong_side");
    if (decision.kind !== "wrong_side") return;
    assert.equal(decision.failure, "front_is_back");
    assert.equal(decision.retakeBoth, false);
  });

  it("catches a front-only scan that is actually the back of the card", () => {
    const decision = decideExtraction(
      goodScan({
        frontImageSide: "back",
        backImageSide: null,
        backScanned: false,
        presentAddress: null,
      }),
    );

    assert.equal(decision.kind, "wrong_side");
    if (decision.kind !== "wrong_side") return;
    assert.equal(decision.failure, "front_is_back");
  });
});

// ===========================================================================
/*
 * Ordering. The side check has to run BEFORE the accuracy gate, or it never
 * fires on the case it exists for: a wrong-side scan that is otherwise
 * flawless sails through the gate untouched.
 */
describe("Scenario: ordering of the checks", () => {
  it("reports the wrong side even though the read would have passed the gate", () => {
    const decision = decideExtraction(goodScan({ backImageSide: "front" }));
    assert.equal(decision.kind, "wrong_side");
  });

  it("still reports the wrong side when the read ALSO fails the gate", () => {
    // Both things are true; the actionable one is the side.
    const decision = decideExtraction(
      goodScan({ backImageSide: "front", readable: false, confidence: 0.1 }),
    );
    assert.equal(decision.kind, "wrong_side");
  });
});

// ===========================================================================
/*
 * The second reported bug. The back WAS photographed, the sides were right,
 * the read passed — and no address came out. That is not a gate failure, so
 * the scan used to succeed with a blank address, no explanation and nothing to
 * press. The citizen must now be told, and offered a way through.
 */
describe("Scenario: the back is scanned but yields no address", () => {
  it("passes the scan but flags the address as unreadable and needing manual entry", () => {
    const decision = decideExtraction(
      goodScan({ presentAddress: null, permanentAddress: null }),
    );

    assert.equal(decision.kind, "accepted");
    if (decision.kind !== "accepted") return;

    // The identity fields are fine and must not be thrown away.
    assert.ok(decision.acceptedFields.includes("fullName"));
    assert.ok(decision.acceptedFields.includes("cnicNumber"));

    assert.equal(decision.addressOutcome, "unreadable");
    assert.equal(
      decision.addressNeedsManualEntry,
      true,
      "a blank address must never be presented without a way forward",
    );
  });

  it("treats an address block of all-nulls the same as no block at all", () => {
    const decision = decideExtraction(
      goodScan({
        presentAddress: { ...EMPTY_ADDRESS, confidence: 0.95 },
        permanentAddress: null,
      }),
    );

    assert.equal(decision.kind, "accepted");
    if (decision.kind !== "accepted") return;
    assert.equal(decision.addressOutcome, "unreadable");
    assert.equal(decision.addressNeedsManualEntry, true);
  });

  it("flags a fragment as partial rather than pretending it is an address", () => {
    const decision = decideExtraction(
      goodScan({
        presentAddress: { ...EMPTY_ADDRESS, houseNumber: "123", confidence: 0.95 },
      }),
    );

    assert.equal(decision.kind, "accepted");
    if (decision.kind !== "accepted") return;
    assert.equal(decision.addressOutcome, "partial");
    assert.equal(decision.addressNeedsManualEntry, true);
  });
});

// ===========================================================================
describe("Scenario: the citizen skips the back entirely", () => {
  it("accepts the identity fields when the back gave no address and no side opinion", () => {
    // Back photographed, model non-committal about which side it was, no
    // address found. The scan still stands; the address does not.
    const decision = decideExtraction(
      goodScan({
        backScanned: true,
        backReadable: null,
        backImageSide: null,
        presentAddress: null,
        permanentAddress: null,
      }),
    );

    assert.equal(decision.kind, "accepted");
    if (decision.kind !== "accepted") return;
    assert.equal(decision.addressNeedsManualEntry, true);
  });

  it("distinguishes a never-scanned back from a scanned one that failed", () => {
    const decision = decideExtraction(
      goodScan({
        backScanned: false,
        backReadable: null,
        backImageSide: null,
        presentAddress: null,
        permanentAddress: null,
      }),
    );

    assert.equal(decision.kind, "accepted");
    if (decision.kind !== "accepted") return;
    assert.equal(
      decision.addressOutcome,
      "not_printed",
      "'you never showed us the back' needs different words from 'we couldn't read it'",
    );
  });

  it("never leaks a stale address when no back was scanned", () => {
    const decision = decideExtraction(
      goodScan({ backScanned: false, backReadable: null, backImageSide: null }),
    );

    assert.equal(decision.kind, "accepted");
    if (decision.kind !== "accepted") return;
    assert.equal(decision.presentAddress, null);
    assert.equal(decision.permanentAddress, null);
  });
});

// ===========================================================================
describe("Scenario: the address is read but not confidently", () => {
  it("rejects the scan and points at the back, rather than showing a guessed address", () => {
    const decision = decideExtraction(
      goodScan({
        presentAddress: {
          ...EMPTY_ADDRESS,
          raw: "مکان نمبر 123، گلی نمبر 5",
          confidence: 0.4,
        },
      }),
    );

    assert.equal(decision.kind, "rejected");
    if (decision.kind !== "rejected") return;
    assert.equal(decision.failure, "address_unclear");
    assert.equal(decision.affectedSide, "back");
  });

  it("sends the citizen to the back camera only, keeping the good front", () => {
    const plan = planRetake("back", { front: true, back: true });
    assert.deepEqual(plan, { retake: "back", keeps: "front", discards: ["back"] });
  });
});

// ===========================================================================
describe("Scenario: individual fields are unclear", () => {
  it("rejects the whole read when the CNIC number is not confident", () => {
    const decision = decideExtraction(
      goodScan({ fieldConfidence: { fullName: 0.95, cnicNumber: 0.4 } }),
    );

    assert.equal(decision.kind, "rejected");
    if (decision.kind !== "rejected") return;
    assert.equal(decision.failure, "critical_field_unclear");
    // Name and CNIC number are only ever printed on the front.
    assert.equal(decision.affectedSide, "front");
  });

  it("rejects a malformed CNIC number even at high confidence", () => {
    // The route nulls a non-CNIC-shaped number before the decision runs.
    const decision = decideExtraction(
      goodScan({ values: { ...goodScan().values, cnicNumber: null } }),
    );

    assert.equal(decision.kind, "rejected");
    if (decision.kind !== "rejected") return;
    assert.equal(decision.failure, "critical_field_unclear");
  });

  it("drops one unconfident optional field but keeps the scan", () => {
    const decision = decideExtraction(
      goodScan({
        fieldConfidence: {
          fullName: 0.95,
          cnicNumber: 0.96,
          fatherName: 0.3,
          dateOfBirth: 0.9,
          gender: 0.95,
        },
      }),
    );

    assert.equal(decision.kind, "accepted");
    if (decision.kind !== "accepted") return;
    assert.ok(decision.droppedFields.includes("fatherName"));
    assert.ok(!decision.acceptedFields.includes("fatherName"));
    // Everything else survives — one weak field is not a failed scan.
    assert.ok(decision.acceptedFields.includes("fullName"));
  });

  it("never shows a field it dropped", () => {
    const decision = decideExtraction(
      goodScan({ fieldConfidence: { fullName: 0.95, cnicNumber: 0.96, gender: 0.2 } }),
    );

    assert.equal(decision.kind, "accepted");
    if (decision.kind !== "accepted") return;
    for (const field of decision.droppedFields) {
      assert.ok(
        !decision.acceptedFields.includes(field),
        `${field} is both accepted and dropped`,
      );
    }
  });
});

// ===========================================================================
/*
 * A citizen who genuinely cannot get a good scan must always end up somewhere.
 * Across every rejection the pipeline can produce, the retake planner must
 * return a reachable camera and a self-consistent set of photos — never a
 * state where the flow has discarded everything and has nowhere to send them.
 */
describe("Scenario: no rejection can strand the citizen", () => {
  it("every rejection yields a usable retake plan", () => {
    const rejections: DecisionInput[] = [
      goodScan({ readable: false, frontReadable: false, backReadable: false }),
      goodScan({ readable: false, frontReadable: false, backReadable: true }),
      goodScan({ readable: false, frontReadable: true, backReadable: false }),
      goodScan({ readable: false, frontReadable: null, backReadable: null }),
      goodScan({ confidence: 0.3 }),
      goodScan({ fieldConfidence: { fullName: 0.2, cnicNumber: 0.2 } }),
      goodScan({
        presentAddress: { ...EMPTY_ADDRESS, raw: "unclear", confidence: 0.1 },
      }),
    ];

    for (const input of rejections) {
      const decision = decideExtraction(input);
      assert.equal(decision.kind, "rejected", "expected this input to be rejected");
      if (decision.kind !== "rejected") continue;

      const plan = planRetake(decision.affectedSide, { front: true, back: true });

      assert.ok(
        plan.retake === "front" || plan.retake === "back",
        "every rejection must name a camera to return to",
      );
      if (plan.keeps) {
        assert.ok(
          !plan.discards.includes(plan.keeps),
          "a plan may not both keep and discard the same side",
        );
      }
    }
  });
});
