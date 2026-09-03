import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkSubmittedSides } from "../src/lib/cnic-side-check";

/*
 * The failure this module exists for is the one that produces NO error at all
 * without it: a citizen photographs the front of their CNIC twice. The read
 * that comes back is confident, correct and complete — and has no address in
 * it, because no picture of the address was ever taken.
 *
 * Every confidence check passes. The citizen is shown a successful scan with a
 * blank address and no explanation. Retrying does not help, because nothing
 * has noticed which side is actually in the photograph.
 */
describe("checkSubmittedSides", () => {
  const ok = { ok: true, failure: null, retake: null, retakeBoth: false };

  // -- The normal case ---------------------------------------------------
  it("passes when the front is the front and the back is the back", () => {
    assert.deepEqual(
      checkSubmittedSides({ front: "front", back: "back", backSubmitted: true }),
      ok,
    );
  });

  it("passes a front-only submission", () => {
    assert.deepEqual(
      checkSubmittedSides({ front: "front", back: null, backSubmitted: false }),
      ok,
    );
  });

  // -- The bug: the front photographed twice ------------------------------
  it("catches the front being photographed twice, and asks for the back", () => {
    const result = checkSubmittedSides({
      front: "front",
      back: "front",
      backSubmitted: true,
    });

    assert.equal(result.ok, false);
    assert.equal(result.failure, "same_side_twice");
    // The missing side is the one the citizen has to go and photograph.
    assert.equal(result.retake, "back");
  });

  it("catches the back being photographed twice, and asks for the front", () => {
    const result = checkSubmittedSides({
      front: "back",
      back: "back",
      backSubmitted: true,
    });

    assert.equal(result.ok, false);
    assert.equal(result.failure, "same_side_twice");
    assert.equal(result.retake, "front");
  });

  // -- Sides swapped -----------------------------------------------------
  /*
   * Both photos are in the wrong slot. Reported as its own failure rather than
   * as "the front is the back", because the naive single-side answer costs the
   * citizen a whole round trip: retaking only the front leaves a back-slot
   * photo that is really a front, so the next attempt fails as "the same side
   * twice" and they are told something different each time.
   */
  it("catches the two sides being swapped, and asks for both again", () => {
    const result = checkSubmittedSides({
      front: "back",
      back: "front",
      backSubmitted: true,
    });

    assert.equal(result.ok, false);
    assert.equal(result.failure, "sides_swapped");
    assert.equal(result.retake, "front", "the flow restarts at the front");
    assert.equal(result.retakeBoth, true, "neither photo is in the right slot");
  });

  it("reports front_is_back when only the front slot is wrong", () => {
    // The back slot gave no usable opinion, so only the front is accused.
    const result = checkSubmittedSides({
      front: "back",
      back: "unknown",
      backSubmitted: true,
    });

    assert.equal(result.ok, false);
    assert.equal(result.failure, "front_is_back");
    assert.equal(result.retake, "front");
    assert.equal(result.retakeBoth, false);
  });

  it("catches a front-only submission that is actually the back of the card", () => {
    const result = checkSubmittedSides({
      front: "back",
      back: null,
      backSubmitted: false,
    });

    assert.equal(result.ok, false);
    assert.equal(result.failure, "front_is_back");
    assert.equal(result.retake, "front");
    assert.equal(result.retakeBoth, false, "a front-only scan has no second photo to retake");
  });

  /*
   * The address lives on the back. This exact combination — a good front, and
   * the front again in the back slot — is the one that used to produce a
   * silently address-less "successful" scan.
   */
  it("catches a good front followed by the front again, and asks only for the back", () => {
    const result = checkSubmittedSides({
      front: "front",
      back: "front",
      backSubmitted: true,
    });

    assert.equal(result.ok, false);
    assert.equal(result.retake, "back", "the good front must not be thrown away");
  });

  // -- Never accuse on a shrug -------------------------------------------
  /*
   * Only a positive, confident observation may raise a complaint. Sending a
   * citizen back to re-photograph a perfectly good card because the model was
   * non-committal would be worse than the silence this check replaces.
   */
  it('never complains when the model reports "unknown" for a side', () => {
    assert.deepEqual(
      checkSubmittedSides({ front: "unknown", back: "back", backSubmitted: true }),
      ok,
    );
    assert.deepEqual(
      checkSubmittedSides({ front: "front", back: "unknown", backSubmitted: true }),
      ok,
    );
    assert.deepEqual(
      checkSubmittedSides({ front: "unknown", back: "unknown", backSubmitted: true }),
      ok,
    );
  });

  it("never complains when the model gives no opinion at all", () => {
    assert.deepEqual(
      checkSubmittedSides({ front: null, back: null, backSubmitted: true }),
      ok,
    );
  });

  it('does not treat two "unknown" images as the same side twice', () => {
    // Both are literally equal, but neither is an observation of anything.
    const result = checkSubmittedSides({
      front: "unknown",
      back: "unknown",
      backSubmitted: true,
    });
    assert.equal(result.ok, true);
  });

  // -- A back that was never sent cannot be wrong -------------------------
  /*
   * The back is optional by design. A stale observation left over from an
   * earlier read must never be able to fail a front-only submission.
   */
  it("ignores an observed back side when no back image was submitted", () => {
    assert.deepEqual(
      checkSubmittedSides({ front: "front", back: "front", backSubmitted: false }),
      ok,
    );
    assert.deepEqual(
      checkSubmittedSides({ front: "front", back: "back", backSubmitted: false }),
      ok,
    );
  });

  // -- Every combination is decidable -------------------------------------
  it("returns a retake target on every failure, and none on every pass", () => {
    const sides = ["front", "back", "unknown", null] as const;

    for (const front of sides) {
      for (const back of sides) {
        for (const backSubmitted of [true, false]) {
          const result = checkSubmittedSides({ front, back, backSubmitted });
          const label = `front=${String(front)} back=${String(back)} submitted=${backSubmitted}`;

          if (result.ok) {
            assert.equal(result.failure, null, `${label}: passing result carries a failure`);
            assert.equal(result.retake, null, `${label}: passing result asks for a retake`);
            assert.equal(result.retakeBoth, false, `${label}: passing result discards photos`);
          } else {
            assert.ok(result.failure, `${label}: failing result names no failure`);
            assert.ok(result.retake, `${label}: failing result names no side to retake`);
            // Only a swap may throw away both photos.
            if (result.retakeBoth) {
              assert.equal(
                result.failure,
                "sides_swapped",
                `${label}: discarded both photos for a non-swap failure`,
              );
            }
          }
        }
      }
    }
  });
});
