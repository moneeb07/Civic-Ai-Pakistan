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
    assert.deepEqual(planRetake("back", both), {
      retake: "back",
      keeps: "front",
      discards: ["back"],
    });
  });

  // -- Scenario B: front bad, back good --------------------------------
  it("Scenario B — a front-only failure retakes FRONT and keeps BACK", () => {
    assert.deepEqual(planRetake("front", both), {
      retake: "front",
      keeps: "back",
      discards: ["front"],
    });
  });

  // -- Scenario D: extraction blames a specific side -------------------
  it("routes a critical front-field failure (name/CNIC) to the front, keeping the back", () => {
    // The gate reports critical_field_unclear as affectedSide "front" —
    // this is that signal reaching the retake plan.
    assert.deepEqual(planRetake("front", both), {
      retake: "front",
      keeps: "back",
      discards: ["front"],
    });
  });

  it("routes an unreadable-address failure to the back, keeping the front", () => {
    // The gate reports address_unclear as affectedSide "back".
    assert.deepEqual(planRetake("back", both), {
      retake: "back",
      keeps: "front",
      discards: ["back"],
    });
  });

  // -- Both sides explicitly bad ----------------------------------------
  /*
   * The regression this file exists for.
   *
   * When the model reports BOTH images unreadable, keeping the back meant the
   * citizen was sent to the front camera, their new front was immediately
   * re-submitted against the same unreadable back, and the read failed in
   * exactly the same way — with the back camera never shown again. The address
   * is printed on the back, so the symptom a citizen actually reported was
   * "it only asks for the front the second time, and the address never works".
   */
  it('"both" discards BOTH photos so the citizen re-walks front and back', () => {
    assert.deepEqual(planRetake("both", both), {
      retake: "front",
      keeps: null,
      discards: ["front", "back"],
    });
  });

  it('never re-uses the stale back after a "both" verdict', () => {
    const plan = planRetake("both", both);
    assert.equal(plan.keeps, null, "a back the model called unreadable must not be kept");
    assert.ok(
      plan.discards.includes("back"),
      "the unreadable back must be discarded, or the retry re-submits it",
    );
  });

  it('"both" with only a front on file still just retakes the front', () => {
    assert.deepEqual(planRetake("both", { front: true, back: false }), {
      retake: "front",
      keeps: null,
      discards: ["front"],
    });
  });

  // -- Ambiguous / unknown ----------------------------------------------
  /*
   * "unknown" is a different claim from "both": the model said nothing about
   * either side, rather than condemning both. Discarding a back on the
   * strength of an absence of evidence would make a citizen re-photograph a
   * side that was never implicated.
   */
  it('treats "unknown" as the honest fallback: front first, back still kept', () => {
    assert.deepEqual(planRetake("unknown", both), {
      retake: "front",
      keeps: "back",
      discards: ["front"],
    });
  });

  it("treats a missing signal (older shape, or genuinely no answer) as unknown", () => {
    const expected = { retake: "front", keeps: "back", discards: ["front"] };
    assert.deepEqual(planRetake(null, both), expected);
    assert.deepEqual(planRetake(undefined, both), expected);
  });

  // -- Never re-uses a photo that was never captured ---------------------
  it("keeps nothing when only the front was ever photographed", () => {
    assert.deepEqual(planRetake("unknown", { front: true, back: false }), {
      retake: "front",
      keeps: null,
      discards: ["front"],
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
      discards: [],
    });
  });

  it("never discards a good back over an unknown verdict", () => {
    const plan = planRetake("unknown", both);
    assert.equal(plan.keeps, "back", "an unimplicated back must survive an unknown verdict");
    assert.deepEqual(plan.discards, ["front"]);
  });

  // -- The plan is always self-consistent -------------------------------
  /*
   * Property check across every input combination: a kept side is never also
   * discarded, and a side that is neither kept nor discarded never exists —
   * because that is exactly the state the original bug lived in. The caller
   * holds the blobs, so a plan that leaves a photo unaccounted for is a plan
   * that can be half-applied.
   */
  it("never both keeps and discards a side, and accounts for every photo on file", () => {
    const verdicts = ["front", "back", "both", "unknown", null, undefined] as const;
    const files = [
      { front: true, back: true },
      { front: true, back: false },
      { front: false, back: true },
      { front: false, back: false },
    ];

    for (const verdict of verdicts) {
      for (const onFile of files) {
        const plan = planRetake(verdict, onFile);
        const label = `${String(verdict)} / front=${onFile.front} back=${onFile.back}`;

        if (plan.keeps) {
          assert.ok(
            !plan.discards.includes(plan.keeps),
            `${label}: kept side is also discarded`,
          );
          assert.ok(onFile[plan.keeps], `${label}: kept a photo that was never taken`);
        }

        for (const side of ["front", "back"] as const) {
          if (!onFile[side]) {
            assert.ok(
              !plan.discards.includes(side),
              `${label}: discards a photo that does not exist`,
            );
            continue;
          }
          assert.ok(
            plan.keeps === side || plan.discards.includes(side),
            `${label}: ${side} is on file but neither kept nor discarded`,
          );
        }
      }
    }
  });
});

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
