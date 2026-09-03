import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCEPT_SCORE,
  CAPTURE_SCORE,
  CAPTURE_SETTLE_MS,
  REJECT_SCORE,
  STABLE_FRAMES_REQUIRED,
  preScreen,
  scoreFrom,
  shouldAutoCapture,
  tierFor,
  validateCnic,
  type QualitySignals,
  type VisionReadability,
} from "../src/lib/cnic/validation";

/*
 * The bug this suite exists for, in one sentence: a visibly blurred CNIC
 * reached the "Use this photo" button.
 *
 * It got there because "image captured" was treated as "CNIC scanned". The
 * camera judged a LIVE FRAME with deliberately permissive pixel heuristics —
 * the old blur threshold's own comment said it "only needs to catch genuine
 * motion blur, not merely not-crisp" — then never looked at the photograph it
 * actually took. The gallery ran no quality check whatsoever.
 *
 * Negative cases dominate below, deliberately. A scanner that accepts
 * everything passes every positive test ever written.
 */

/** A photograph good enough to extract from. Individual tests spoil one axis. */
function goodSignals(overrides: Partial<QualitySignals> = {}): QualitySignals {
  return {
    documentConfidence: 0.95,
    sharpness: 0.95,
    lighting: 0.9,
    glareFree: 0.95,
    perspective: 0.9,
    completeness: 0.95,
    ...overrides,
  };
}

function goodVision(overrides: Partial<VisionReadability> = {}): VisionReadability {
  return {
    isPakistaniCnic: true,
    observedSide: "front",
    readability: "readable",
    confidence: 0.94,
    fieldConfidence: {
      cnicNumber: 0.96,
      name: 0.95,
      fatherOrHusbandName: 0.93,
      dateOfBirth: 0.92,
      gender: 0.95,
    },
    blurDetected: false,
    glareDetected: false,
    cropped: false,
    perspectiveIssue: false,
    ...overrides,
  };
}

// ===========================================================================
describe("POSITIVE — a clear CNIC is accepted", () => {
  it("accepts a sharp, complete, well-lit front", () => {
    const result = validateCnic({
      expectedSide: "front",
      signals: goodSignals(),
      vision: goodVision(),
    });

    assert.equal(result.state, "READABLE");
    assert.ok(result.score >= ACCEPT_SCORE, `score ${result.score} below the bar`);
    assert.equal(result.instruction, "", "an accepted image needs no instruction");
    assert.deepEqual(result.unreadableFields, []);
  });

  it("accepts a back whose address reads cleanly, without demanding a CNIC number", () => {
    /*
     * The back does not print the identity number. Requiring it would reject
     * every correct back image — the kind of blanket rule that makes a
     * scanner unusable.
     */
    const result = validateCnic({
      expectedSide: "back",
      signals: goodSignals(),
      vision: goodVision({
        observedSide: "back",
        fieldConfidence: { presentAddress: 0.91, permanentAddress: 0.88 },
      }),
    });

    assert.equal(result.state, "READABLE");
  });

  it("accepts a gallery upload with no local pixel signals", () => {
    /*
     * The regression the brief calls out: valid gallery photographs were being
     * rejected. An upload has no live frame history, and the absence of pixel
     * signals must not be scored as bad pixels.
     */
    const result = validateCnic({
      expectedSide: "front",
      signals: null,
      vision: goodVision(),
    });

    assert.equal(result.state, "READABLE");
    assert.ok(result.score >= ACCEPT_SCORE);
  });

  it("accepts a slightly imperfect but genuinely readable photo", () => {
    // Real hand-held photographs are never pristine; 85 is the bar, not 100.
    const result = validateCnic({
      expectedSide: "front",
      signals: goodSignals({ lighting: 0.72, perspective: 0.75, glareFree: 0.8 }),
      vision: goodVision({ confidence: 0.89 }),
    });

    assert.equal(result.state, "READABLE");
  });
});

// ===========================================================================
describe("NEGATIVE — unreadable images are refused", () => {
  it("refuses a blurred card even when the model returns field values", () => {
    /*
     * THE reported bug. The model can complete the layout of a CNIC it cannot
     * actually see, so "OCR produced characters" must never be mistaken for
     * "the card is legible".
     */
    const result = validateCnic({
      expectedSide: "front",
      signals: goodSignals({ sharpness: 0.15 }),
      vision: goodVision({
        readability: "not_readable",
        blurDetected: true,
        confidence: 0.35,
      }),
    });

    assert.equal(result.state, "NOT_READABLE");
    assert.match(result.instruction, /steady|blur/i);
  });

  it("refuses when the model says not_readable, however good the pixels look", () => {
    // The model's negative verdict is authoritative. We may refuse an image it
    // liked; we never accept one it called unreadable.
    const result = validateCnic({
      expectedSide: "front",
      signals: goodSignals(),
      vision: goodVision({ readability: "not_readable", confidence: 0.2 }),
    });

    assert.equal(result.state, "NOT_READABLE");
  });

  it("refuses a card whose CNIC number cannot be read, however sharp the photo", () => {
    /*
     * A crisp photograph of a card with a thumb over the number is a perfect
     * photograph and a useless scan. Field-level readability, not a single
     * global sharpness score.
     */
    const result = validateCnic({
      expectedSide: "front",
      signals: goodSignals(),
      vision: goodVision({
        fieldConfidence: {
          cnicNumber: 0.3,
          name: 0.95,
          fatherOrHusbandName: 0.94,
          dateOfBirth: 0.93,
        },
      }),
    });

    assert.notEqual(result.state, "READABLE");
    assert.ok(result.unreadableFields.includes("cnicNumber"));
  });

  it("treats a field the model omitted as unread, not as fine", () => {
    const result = validateCnic({
      expectedSide: "front",
      signals: goodSignals(),
      vision: goodVision({ fieldConfidence: { cnicNumber: 0.95, name: 0.95 } }),
    });

    assert.notEqual(result.state, "READABLE");
    assert.ok(result.unreadableFields.includes("dateOfBirth"));
  });

  it("refuses a photograph that is not a CNIC at all", () => {
    const result = validateCnic({
      expectedSide: "front",
      signals: goodSignals(),
      vision: goodVision({ isPakistaniCnic: false, readability: "not_readable" }),
    });

    assert.equal(result.state, "NOT_A_CNIC");
    assert.match(result.instruction, /Pakistani CNIC/i);
  });

  it("refuses when there is no vision result at all", () => {
    /*
     * A validator that cannot answer must never become a validator that says
     * yes. A failed or missing model call is a rejection.
     */
    const result = validateCnic({
      expectedSide: "front",
      signals: goodSignals(),
      vision: null,
    });

    assert.equal(result.state, "NOT_READABLE");
    assert.equal(result.score, 0);
  });

  it("refuses a partially readable card", () => {
    const result = validateCnic({
      expectedSide: "front",
      signals: goodSignals(),
      vision: goodVision({ readability: "partially_readable", confidence: 0.8 }),
    });

    assert.equal(result.state, "NEEDS_IMPROVEMENT");
  });

  it("never accepts anything scoring below the acceptance bar", () => {
    // Property check across a spread of degraded photographs.
    const degradations: Partial<QualitySignals>[] = [
      { sharpness: 0.1 },
      { completeness: 0.2 },
      { documentConfidence: 0.1 },
      { lighting: 0.1 },
      { glareFree: 0.05 },
      { sharpness: 0.4, lighting: 0.4, glareFree: 0.4 },
    ];

    for (const degradation of degradations) {
      const signals = goodSignals(degradation);
      const result = validateCnic({
        expectedSide: "front",
        signals,
        vision: goodVision({ confidence: 0.6 }),
      });

      if (result.state === "READABLE") {
        assert.fail(
          `accepted a degraded image (${JSON.stringify(degradation)}) at score ${result.score}`,
        );
      }
    }
  });

  it("always names something the citizen can physically do", () => {
    const cases: VisionReadability[] = [
      goodVision({ readability: "not_readable", blurDetected: true }),
      goodVision({ readability: "not_readable", glareDetected: true }),
      goodVision({ readability: "not_readable", cropped: true }),
      goodVision({ readability: "not_readable", perspectiveIssue: true }),
      goodVision({ isPakistaniCnic: false }),
    ];

    for (const vision of cases) {
      const result = validateCnic({ expectedSide: "front", signals: null, vision });
      assert.ok(
        result.instruction.length > 10,
        "a refusal must carry an actionable instruction",
      );
    }
  });
});

// ===========================================================================
describe("SCORING — the number is earned, not assumed", () => {
  it("never returns a high score for a bad image", () => {
    assert.ok(
      scoreFrom({
        documentConfidence: 0,
        sharpness: 0,
        lighting: 0,
        glareFree: 0,
        perspective: 0,
        completeness: 0,
      }) === 0,
    );
  });

  it("weights sharpness above lighting, because sharpness decides legibility", () => {
    const blurredButBright = scoreFrom(goodSignals({ sharpness: 0 }));
    const sharpButDim = scoreFrom(goodSignals({ lighting: 0 }));

    assert.ok(
      sharpButDim > blurredButBright,
      "a sharp dim photo must outscore a bright blurred one",
    );
  });

  it("cannot be dragged above the bar by five good signals and one catastrophic one", () => {
    /*
     * The specific failure mode of a naive weighted sum: a totally smeared
     * frame that is well lit, square, glare-free and fully in shot still
     * collects half the points from those axes, which showed ORANGE
     * ("improve the image") for a frame that is not improvable. Sharpness,
     * document detection and completeness are prerequisites, not contributors.
     */
    assert.ok(scoreFrom(goodSignals({ sharpness: 0 })) <= 30);
    assert.ok(scoreFrom(goodSignals({ documentConfidence: 0 })) <= 30);
    assert.ok(scoreFrom(goodSignals({ completeness: 0 })) <= 30);
    assert.equal(preScreen(goodSignals({ sharpness: 0 })).tier, "red");
  });

  it("stays within 0–100 for any input, including out-of-range values", () => {
    const wild = scoreFrom({
      documentConfidence: 5,
      sharpness: -3,
      lighting: Number.NaN,
      glareFree: 100,
      perspective: -1,
      completeness: 2,
    });

    assert.ok(wild >= 0 && wild <= 100, `score out of range: ${wild}`);
  });
});

// ===========================================================================
describe("AUTO-CAPTURE — stability is required", () => {
  it("does not fire on a single good frame", () => {
    /*
     * One lucky frame between two blurred ones is exactly how a smeared photo
     * gets taken. This is invisible in any single-frame test, which is why the
     * temporal rule is its own function.
     */
    assert.equal(shouldAutoCapture("READABLE", 1), false);
    assert.equal(shouldAutoCapture("READABLE", STABLE_FRAMES_REQUIRED - 1), false);
  });

  it("fires once the run of good frames is long enough", () => {
    assert.equal(shouldAutoCapture("READABLE", STABLE_FRAMES_REQUIRED), true);
  });

  it("never fires on a frame that is not readable, however long the run", () => {
    for (const state of ["NOT_A_CNIC", "NOT_READABLE", "NEEDS_IMPROVEMENT"] as const) {
      assert.equal(
        shouldAutoCapture(state, 999),
        false,
        `${state} must never auto-capture`,
      );
    }
  });
});

// ===========================================================================
describe("TIERS — red, orange, green", () => {
  it("maps every state to exactly one tier", () => {
    assert.equal(tierFor("READABLE"), "green");
    assert.equal(tierFor("NEEDS_IMPROVEMENT"), "orange");
    assert.equal(tierFor("NOT_READABLE"), "red");
    assert.equal(tierFor("NOT_A_CNIC"), "red");
  });

  it("pre-screens a clear frame green and a blurred one red", () => {
    assert.equal(preScreen(goodSignals()).tier, "green");
    assert.equal(preScreen(goodSignals({ sharpness: 0, documentConfidence: 0.1 })).tier, "red");
  });

  it("gives an orange frame something to act on, and a green frame reassurance", () => {
    const orange = preScreen(
      goodSignals({ sharpness: 0.35, documentConfidence: 0.5, completeness: 0.6 }),
    );
    assert.equal(orange.tier, "orange");
    assert.ok(orange.instruction.length > 0);

    assert.match(preScreen(goodSignals()).instruction, /detected|still/i);
  });

  /*
   * The regression this pins down: the capture bar and the accept bar were
   * once the same number, and auto-capture stopped working entirely. The live
   * heuristics measure compressed, auto-exposed video and score a genuinely
   * good frame well below what the same card scores as a still, so requiring
   * the full accept bar from a webcam meant the shutter never fired at any
   * distance. Green must mean "about to capture", not "will be accepted".
   */
  it("fires the shutter below the accept bar, so a webcam can actually capture", () => {
    assert.ok(
      CAPTURE_SCORE < ACCEPT_SCORE,
      "the capture bar must sit below the acceptance bar",
    );
  });

  it("reaches green on a realistically soft but usable webcam frame", () => {
    // Roughly what a decent laptop camera produces on a well-placed card:
    // soft, slightly angled, imperfectly lit — and entirely capturable.
    const webcam = {
      documentConfidence: 0.72,
      sharpness: 0.55,
      lighting: 0.7,
      glareFree: 0.85,
      perspective: 0.85,
      completeness: 0.75,
    };

    assert.equal(
      preScreen(webcam).tier,
      "green",
      `a usable webcam frame must capture, scored ${preScreen(webcam).score}`,
    );
  });

  it("keeps the tier boundaries consistent with the capture and reject bars", () => {
    for (let value = 0; value <= 1; value += 0.05) {
      const signals = goodSignals({
        documentConfidence: value,
        sharpness: value,
        lighting: value,
        glareFree: value,
        perspective: value,
        completeness: value,
      });
      const { score, tier } = preScreen(signals);

      if (tier === "green") assert.ok(score >= CAPTURE_SCORE);
      if (tier === "red") assert.ok(score < CAPTURE_SCORE);
    }

    // The server's bar is unchanged and still stricter than the shutter's.
    assert.ok(REJECT_SCORE < ACCEPT_SCORE);
  });
});

// ===========================================================================
/*
 * The gallery-upload rejection, reproduced exactly.
 *
 * The camera's live loop stores the pixel signals of the frame it last saw,
 * and that ref was never cleared. So when somebody gave up on the webcam and
 * uploaded a photo instead — which is precisely when the last camera frame was
 * a BAD one — those stale signals were attached to the uploaded image. A
 * pristine phone photograph was then scored against the statistics of a poor
 * webcam frame and refused, with a camera instruction ("Move the CNIC closer
 * to the camera") shown on a file upload.
 */
describe("REGRESSION — an upload must not be judged by the camera's last frame", () => {
  /** What the live loop had measured just before the citizen gave up on it. */
  const staleCameraSignals: QualitySignals = {
    documentConfidence: 0.15,
    sharpness: 0.2,
    lighting: 0.5,
    glareFree: 0.9,
    perspective: 0.85,
    completeness: 0.1,
  };

  it("refuses the good image when stale camera signals are attached", () => {
    // The bug, pinned: identical vision result, ruined by borrowed pixels.
    const result = validateCnic({
      expectedSide: "front",
      signals: staleCameraSignals,
      vision: goodVision(),
    });

    assert.notEqual(result.state, "READABLE");
    assert.match(
      result.instruction,
      /closer|frame|steady/i,
      "and it advises the camera, on an upload",
    );
  });

  it("accepts the same image when it is judged as an upload, with no signals", () => {
    const result = validateCnic({
      expectedSide: "front",
      signals: null,
      vision: goodVision(),
    });

    assert.equal(result.state, "READABLE");
  });

  it("scores an upload purely on what the model could read", () => {
    /*
     * With no pixel signals the score IS the model's confidence, so a
     * confident read cannot be dragged under the bar by a number that was
     * never measured from this image.
     */
    const confident = validateCnic({
      expectedSide: "front",
      signals: null,
      vision: goodVision({ confidence: 0.93 }),
    });

    assert.equal(confident.score, 93);
    assert.equal(confident.state, "READABLE");
  });

  it("still refuses a genuinely bad upload, signals or no signals", () => {
    // The fix must not become a way to bypass validation by uploading.
    const result = validateCnic({
      expectedSide: "front",
      signals: null,
      vision: goodVision({ readability: "not_readable", confidence: 0.3 }),
    });

    assert.equal(result.state, "NOT_READABLE");
  });
});

// ===========================================================================
/*
 * "Green border, but it never takes the photo."
 *
 * The shutter used to require BOTH the score AND every one of the analyser's
 * binary pass/fail checks. That double-counted, because tilt, lighting and
 * glare are already graded into the score through the perspective, lighting
 * and glareFree signals. A card the score rated 80 could still be blocked by a
 * tilt check that had failed on the very same frame — and since the border was
 * painted from the score alone, the interface showed GREEN while refusing to
 * fire, with the caption reading "Please straighten the CNIC".
 *
 * The frames below are the ones that were stuck: comfortably good overall,
 * imperfect on exactly one graded axis.
 */
describe("REGRESSION — a good frame with one soft axis must still capture", () => {
  const capturable = (signals: QualitySignals, label: string) => {
    const { score, tier } = preScreen(signals);
    assert.equal(
      tier,
      "green",
      `${label} should capture, scored ${score}`,
    );
    assert.ok(shouldAutoCapture("READABLE", STABLE_FRAMES_REQUIRED));
  };

  it("captures a slightly tilted card that is otherwise clear", () => {
    capturable(
      {
        documentConfidence: 0.85,
        sharpness: 0.7,
        lighting: 0.8,
        glareFree: 0.9,
        // A hand-held card is never square to the lens.
        perspective: 0.35,
        completeness: 0.8,
      },
      "a tilted but clear card",
    );
  });

  it("captures a clear card under imperfect indoor lighting", () => {
    capturable(
      {
        documentConfidence: 0.85,
        sharpness: 0.7,
        lighting: 0.35,
        glareFree: 0.85,
        perspective: 0.8,
        completeness: 0.8,
      },
      "a dim but clear card",
    );
  });

  it("captures a clear card with a small glare patch", () => {
    capturable(
      {
        documentConfidence: 0.85,
        sharpness: 0.7,
        lighting: 0.8,
        glareFree: 0.35,
        perspective: 0.8,
        completeness: 0.8,
      },
      "a card with minor glare",
    );
  });

  /*
   * The counterpart, so the fix is not simply "accept everything": the axes
   * that decide legibility are still prerequisites, and no amount of good
   * lighting rescues a frame that fails one of them.
   */
  it("still refuses to capture when a prerequisite fails", () => {
    for (const [axis, signals] of Object.entries({
      "no card": { documentConfidence: 0.05 },
      "smeared": { sharpness: 0.05 },
      "half out of frame": { completeness: 0.05 },
    })) {
      const frame: QualitySignals = {
        documentConfidence: 0.85,
        sharpness: 0.7,
        lighting: 0.9,
        glareFree: 0.9,
        perspective: 0.9,
        completeness: 0.85,
        ...signals,
      };

      assert.notEqual(
        preScreen(frame).tier,
        "green",
        `${axis} must not capture, scored ${preScreen(frame).score}`,
      );
    }
  });
});

// ===========================================================================
/*
 * "Readable at 0.95 — rejected, all fields unreadable."
 *
 * The model returned its verdict but omitted the per-field breakdown entirely.
 * Since a field with no confidence counts as unread, every required field was
 * listed as unreadable and a pristine card was refused — while the same
 * response said "readable" with 0.95 confidence. The interface contradicted
 * itself using one half of its own answer against the other.
 *
 * The rule that resolves it: a field missing from a POPULATED map is a field
 * the model declined to vouch for, and still counts as unread. An ENTIRELY
 * EMPTY map is not a statement about any field at all.
 */
describe("REGRESSION — an absent field breakdown is not evidence of illegibility", () => {
  it("accepts a card the model called readable but gave no breakdown for", () => {
    const result = validateCnic({
      expectedSide: "front",
      signals: null,
      vision: goodVision({ readability: "readable", confidence: 0.95, fieldConfidence: {} }),
    });

    assert.equal(result.state, "READABLE");
    assert.deepEqual(
      result.unreadableFields,
      [],
      "no breakdown means nothing is known about individual fields, not that all failed",
    );
  });

  it("still refuses when the model gave a breakdown and a required field failed", () => {
    // The strictness that matters is preserved: a populated map is a real
    // statement, and a field left out of it is a field it would not vouch for.
    const result = validateCnic({
      expectedSide: "front",
      signals: null,
      vision: goodVision({
        fieldConfidence: { name: 0.95, fatherOrHusbandName: 0.9, dateOfBirth: 0.9 },
      }),
    });

    assert.notEqual(result.state, "READABLE");
    assert.ok(result.unreadableFields.includes("cnicNumber"));
  });

  it("still refuses an unreadable card that gave no breakdown either", () => {
    /*
     * The fallback must not become a bypass: with no breakdown the overall
     * verdict is the only evidence, and a negative verdict still fails.
     */
    const result = validateCnic({
      expectedSide: "front",
      signals: null,
      vision: goodVision({
        readability: "not_readable",
        confidence: 0.2,
        fieldConfidence: {},
      }),
    });

    assert.equal(result.state, "NOT_READABLE");
  });

  it("treats an all-zero breakdown as a real statement of illegibility", () => {
    // Zeros are an answer — the model looked and could read nothing.
    const result = validateCnic({
      expectedSide: "front",
      signals: null,
      vision: goodVision({
        fieldConfidence: { cnicNumber: 0, name: 0, fatherOrHusbandName: 0, dateOfBirth: 0 },
      }),
    });

    assert.notEqual(result.state, "READABLE");
  });
});

// ===========================================================================
/*
 * "It captures the moment I show the card."
 *
 * The shutter armed after ~750ms of acceptable frames and considered capture
 * from the instant a card appeared. A hand bringing a card up to the lens
 * passes through a moment that measures well while the card is still moving,
 * so the photograph was taken on the way in — smeared, mid-motion, before the
 * citizen had any chance to line the card up.
 *
 * Two independent guards now: a settle period before capture is considered at
 * all, and a much longer run of continuously good frames.
 */
describe("REGRESSION — the shutter must not fire on the way in", () => {
  it("refuses to capture before the card has settled, however good the frames", () => {
    // The card has been in shot for a third of a second and already looks good.
    assert.equal(
      shouldAutoCapture("READABLE", STABLE_FRAMES_REQUIRED, 300),
      false,
      "a card just brought into frame must not be captured",
    );
  });

  it("refuses to capture on a short run of good frames, however long it has settled", () => {
    assert.equal(shouldAutoCapture("READABLE", 4, 60_000), false);
  });

  it("captures once both the settle period and the stable run are satisfied", () => {
    assert.equal(
      shouldAutoCapture("READABLE", STABLE_FRAMES_REQUIRED, CAPTURE_SETTLE_MS),
      true,
    );
  });

  it("demands a genuinely deliberate hold, not a passing moment", () => {
    /*
     * The numbers themselves matter, so they are asserted rather than left to
     * drift back down: at the 150ms analysis interval the stable run is about
     * 1.8 seconds, and it cannot begin until the settle period has elapsed.
     * Somebody has to actually hold the card still.
     */
    assert.ok(
      STABLE_FRAMES_REQUIRED * 150 >= 1500,
      "the stable run must be at least 1.5s of continuously good frames",
    );
    assert.ok(CAPTURE_SETTLE_MS >= 1000, "the settle period must be at least a second");
  });

  it("still never captures a frame that is not readable", () => {
    for (const state of ["NOT_A_CNIC", "NOT_READABLE", "NEEDS_IMPROVEMENT"] as const) {
      assert.equal(shouldAutoCapture(state, 999, 999_999), false);
    }
  });
});
