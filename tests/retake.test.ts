import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MANUAL_FALLBACK_THRESHOLD,
  planRetake,
  shouldOfferManualFallback,
} from "../src/lib/registration/retake";

/*
 * Spec: front and back are validated and retried independently.
 *
 *   FRONT valid, BACK invalid   -> retake BACK only, keep FRONT
 *   FRONT invalid, BACK valid   -> retake FRONT only, keep BACK
 *   Both valid                  -> (caller runs extraction; not this module's job)
 *   Genuinely ambiguous/unknown -> retake FRONT, but never discard an existing BACK
 *
 * `affectedSide` comes straight from the accuracy gate, which is told by the
 * model — per side — whether that specific image was clear enough to read. So
 * these are no longer inferred from which FIELD failed; they are the real
 * side the read points at.
 */
describe("planRetake", () => {
  const both = { front: true, back: true };

  // -- Scenario A: front good, back bad --------------------------------
  it("Scenario A — a back-only failure retakes BACK and keeps FRONT", () => {
    assert.deepEqual(planRetake("back", both), { retake: "back", keeps: "front" });
  });

  // -- Scenario B: front bad, back good --------------------------------
  it("Scenario B — a front-only failure retakes FRONT and keeps BACK", () => {
    assert.deepEqual(planRetake("front", both), { retake: "front", keeps: "back" });
  });

  // -- Scenario D: extraction blames a specific side -------------------
  it("routes a critical front-field failure (name/CNIC) to the front, keeping the back", () => {
    // The gate reports critical_field_unclear as affectedSide "front" —
    // this is that signal reaching the retake plan.
    assert.deepEqual(planRetake("front", both), { retake: "front", keeps: "back" });
  });

  it("routes an unreadable-address failure to the back, keeping the front", () => {
    // The gate reports address_unclear as affectedSide "back".
    assert.deepEqual(planRetake("back", both), { retake: "back", keeps: "front" });
  });

  // -- Ambiguous / unknown ----------------------------------------------
  it('treats "both" as the honest fallback: front first, back still kept', () => {
    assert.deepEqual(planRetake("both", both), { retake: "front", keeps: "back" });
  });

  it("treats a missing signal (older shape, or genuinely no answer) the same as \"both\"", () => {
    assert.deepEqual(planRetake(null, both), { retake: "front", keeps: "back" });
    assert.deepEqual(planRetake(undefined, both), { retake: "front", keeps: "back" });
  });

  // -- Never re-uses a photo that was never captured ---------------------
  it("keeps nothing when only the front was ever photographed", () => {
    assert.deepEqual(planRetake("both", { front: true, back: false }), {
      retake: "front",
      keeps: null,
    });
  });

  /*
   * Without a front on file there is nothing to re-read the new back
   * against, so a back-side failure has to fall back to the front camera
   * rather than promise a re-use that cannot happen.
   */
  it("falls back to the front when the back fails but no front photo is held", () => {
    assert.deepEqual(planRetake("back", { front: false, back: true }), {
      retake: "front",
      keeps: "back",
    });
  });

  it("never discards a good back over an ambiguous verdict", () => {
    const plan = planRetake("both", both);
    assert.equal(plan.keeps, "back", "an existing back must survive an ambiguous retry");
  });
});

/*
 * "Do not trap the user in an endless scan loop." A citizen whose CNIC keeps
 * failing the accuracy gate must be offered manual entry PROMINENTLY, not
 * left to notice a quiet link on their own — but not on the very first
 * attempt either, where it would just be noise ahead of the camera.
 */
describe("shouldOfferManualFallback", () => {
  it("stays quiet on a single failure", () => {
    assert.equal(shouldOfferManualFallback(1, false), false);
  });

  it("offers manual entry once repeated failures cross the threshold", () => {
    assert.equal(shouldOfferManualFallback(MANUAL_FALLBACK_THRESHOLD, false), true);
    assert.equal(shouldOfferManualFallback(MANUAL_FALLBACK_THRESHOLD + 5, false), true);
  });

  it("never offers on zero failures", () => {
    assert.equal(shouldOfferManualFallback(0, false), false);
  });

  it("respects a dismissal", () => {
    assert.equal(shouldOfferManualFallback(MANUAL_FALLBACK_THRESHOLD, true), false);
  });
});
