import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeCnicFrame,
  DISTANCE_BAND_MAX,
  DISTANCE_BAND_MIN,
  IMPROVING_THRESHOLD,
  READABLE_THRESHOLD,
  type RgbaBuffer,
} from "../src/lib/cnic-frame-quality";

/*
 * These tests build small synthetic RGBA scenes by hand — a background colour
 * plus a "card" rectangle — and check that the heuristics call out the right
 * single issue. No browser, no canvas: RgbaBuffer is just a flat byte array,
 * so this exercises the exact same math the live camera loop runs, without
 * needing a DOM.
 */

const WIDTH = 200;
const HEIGHT = 126; // ~1.586:1, the CNIC's own aspect ratio

function makeCanvas(width: number, height: number, bg: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = bg[0];
    data[p * 4 + 1] = bg[1];
    data[p * 4 + 2] = bg[2];
    data[p * 4 + 3] = 255;
  }
  return data;
}

/** Paints a flat rectangle — used for scenes where "blurry" is the point. */
function paintFlatRect(
  data: Uint8ClampedArray,
  width: number,
  rect: { x: number; y: number; w: number; h: number },
  colour: [number, number, number],
) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = (y * width + x) * 4;
      data[i] = colour[0];
      data[i + 1] = colour[1];
      data[i + 2] = colour[2];
    }
  }
}

/**
 * Paints a rectangle with deterministic per-pixel variation, standing in for
 * the printed text/photo detail a real CNIC always has. Without this, a
 * synthetic "well framed" scene would be indistinguishable from a blurred one.
 */
function paintTexturedRect(
  data: Uint8ClampedArray,
  width: number,
  rect: { x: number; y: number; w: number; h: number },
  colour: [number, number, number],
  amplitude = 60,
  rowShift: (y: number) => number = () => 0,
) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    const shift = Math.round(rowShift(y));
    for (let x = rect.x + shift; x < rect.x + rect.w + shift; x++) {
      if (x < 0 || x >= width) continue;
      const i = (y * width + x) * 4;
      const variation = amplitude * Math.sin(x * 0.9) * Math.cos(y * 0.7);
      data[i] = Math.min(255, Math.max(0, colour[0] + variation));
      data[i + 1] = Math.min(255, Math.max(0, colour[1] + variation));
      data[i + 2] = Math.min(255, Math.max(0, colour[2] + variation));
    }
  }
}

/**
 * Paints a rectangle whose luminance ramps smoothly up and down — every
 * neighbouring pixel differs, so it reads as "in focus", but no transition is
 * ever sharp enough to be printed text. This is the case the readability check
 * exists for and the blur check cannot see.
 */
function paintRampRect(
  data: Uint8ClampedArray,
  width: number,
  rect: { x: number; y: number; w: number; h: number },
  base = 30,
  /*
   * 17 is chosen against the module's own two thresholds: high enough that the
   * average gradient clears the blur floor, low enough that no single step
   * counts as a text edge. That gap is precisely what this scene is testing.
   */
  step = 17,
  period = 12,
) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const phase = x % period;
      // Triangle wave: up for half the period, back down for the other half.
      const offset = phase < period / 2 ? phase * step : (period - phase) * step;
      const value = base + offset;
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }
}

function paintGlarePatch(
  data: Uint8ClampedArray,
  width: number,
  rect: { x: number; y: number; w: number; h: number },
) {
  paintFlatRect(data, width, rect, [255, 255, 255]);
}

function buffer(data: Uint8ClampedArray): RgbaBuffer {
  return { data, width: WIDTH, height: HEIGHT };
}

/** A well-lit, centred, textured card with margin on every side — the passing baseline. */
function wellFramedCard(overrides?: { colour?: [number, number, number] }) {
  const data = makeCanvas(WIDTH, HEIGHT, [235, 235, 235]);
  const rect = { x: 40, y: 22, w: 120, h: 82 }; // ~52% coverage, margin all round
  paintTexturedRect(data, WIDTH, rect, overrides?.colour ?? [90, 130, 110]);
  return data;
}

describe("analyzeCnicFrame", () => {
  it("reports no_card for an empty, background-only frame", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.ready, false);
    assert.equal(result.issue, "no_card");
  });

  it("reports too_far when the card occupies a small area of the frame", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    // 70x45 ≈ 12.5% of the frame — inside the too_far band (above no_card's
    // 5% floor, below the 32% ceiling), not just "nothing there".
    paintTexturedRect(data, WIDTH, { x: 65, y: 40, w: 70, h: 45 }, [90, 130, 110]);
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.ready, false);
    assert.equal(result.issue, "too_far");
    assert.ok(result.metrics.coverageRatio < 0.32);
  });

  it("reports too_close when the card fills almost the entire frame", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    paintTexturedRect(data, WIDTH, { x: 2, y: 2, w: WIDTH - 4, h: HEIGHT - 4 }, [90, 130, 110]);
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.ready, false);
    assert.equal(result.issue, "too_close");
    assert.ok(result.metrics.coverageRatio > 0.93);
  });

  it("reports incomplete when the card touches two or more frame edges", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    // Touches the left and top edges; right and bottom keep their margin.
    paintTexturedRect(data, WIDTH, { x: 0, y: 0, w: 140, h: 88 }, [90, 130, 110]);
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.ready, false);
    assert.equal(result.issue, "incomplete");
    assert.ok(result.metrics.edgeTouchCount >= 2);
  });

  it("reports tilted for a card whose edges slant across the frame", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    // A ~29° slant: comfortably over the (deliberately generous, real-camera-
    // tuned) 22° threshold — this is a card lying diagonally, not merely
    // hand-held at a natural angle.
    paintTexturedRect(
      data,
      WIDTH,
      { x: 45, y: 18, w: 110, h: 90 },
      [90, 130, 110],
      60,
      (y) => (y - 63) * 0.55,
    );
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.ready, false);
    assert.equal(result.issue, "tilted");
    assert.ok(result.metrics.tiltDegrees !== null);
    assert.ok(Math.abs(result.metrics.tiltDegrees!) > 22);
  });

  it("reports blurry for a well-framed but flat, detail-less card", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [235, 235, 235]);
    paintFlatRect(data, WIDTH, { x: 40, y: 22, w: 120, h: 82 }, [90, 130, 110]);
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.ready, false);
    assert.equal(result.issue, "blurry");
  });

  it("reports low_light for a dim but otherwise well-framed card", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [5, 5, 5]);
    // Card and background stay far apart in colour (so texture oscillation
    // never dips into "looks like background") while the weighted average
    // brightness across the frame is still comfortably under the (real-camera
    // tuned, much darker-tolerant) threshold — genuine near-dark, not just dim.
    paintTexturedRect(data, WIDTH, { x: 40, y: 22, w: 120, h: 82 }, [55, 55, 55], 30);
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.ready, false);
    assert.equal(result.issue, "low_light");
    assert.ok(result.metrics.brightness < 35);
  });

  it("reports glare for a card with a bright clipped hotspot", () => {
    const data = wellFramedCard();
    /*
     * ~21% of the crop. Comfortably past the (deliberately tolerant,
     * real-camera-tuned) threshold: a small specular highlight on a laminated
     * card is normal and must not fail this check, so the scene that must
     * fail has to be a genuinely blown-out patch, big enough to swallow a field.
     */
    paintGlarePatch(data, WIDTH, { x: 70, y: 30, w: 90, h: 60 });
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.ready, false);
    assert.equal(result.issue, "glare");
    assert.ok(result.metrics.glareRatio > 0.16);
  });

  /*
   * This check is now a smoke test, not a confidence check (see the
   * TEXT_DETAIL_MIN comment in the module) — it should fire only on
   * something that plainly is not a card at all, like a blank wall with
   * gentle shading. A real, if imperfect, CNIC photo must never trip it;
   * that judgment belongs to Gemini's per-field confidence after capture.
   */
  it("reports unreadable for a smoothly-shaded surface with no print on it at all", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [235, 235, 235]);
    // A gentle ramp: tiny per-pixel steps clear the (very low) blur floor by
    // accumulating, but no single step is remotely close to a real edge.
    paintRampRect(data, WIDTH, { x: 34, y: 18, w: 132, h: 90 }, 90, 3, 40);
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.ready, false);
    assert.equal(result.issue, "unreadable");
    // The distinction that matters: sharp enough to pass the blur check, yet
    // still rejected — the two checks are measuring different things.
    assert.ok(result.metrics.sharpness >= 2.5);
    assert.equal(result.metrics.textDetail, 0);
  });

  /*
   * The check this module exists to avoid: a real photo is never as crisp as
   * a synthetic high-contrast test pattern, so a scene built from realistic,
   * DoF-softened print (small, low-amplitude detail, not the hard sine edges
   * the other tests use) must still pass every gate — this is the case the
   * strictness complaint was actually about.
   */
  it("passes a softly-detailed card — a third of the baseline's contrast, still a real photo", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [200, 200, 200]);
    paintTexturedRect(data, WIDTH, { x: 42, y: 24, w: 116, h: 78 }, [70, 100, 88], 20);
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.ready, true);
    assert.equal(result.issue, null);
  });

  it("reports ready when framing, lighting, sharpness, tilt and readability are all good", () => {
    const data = wellFramedCard();
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.issue, null);
    assert.equal(result.ready, true);
    assert.ok(result.metrics.textDetail >= 0.03);
  });

  /*
   * Regression test for the bug where aiming well made things worse.
   *
   * The on-screen guide is CNIC-shaped, so a citizen who does exactly as asked
   * fills it edge to edge. When the analysed region was the guide itself, that
   * ideal placement scored ~100% coverage and touched all four edges, and got
   * told "too close" and "incomplete" at once. The analysis crop is now padded
   * wider than the guide, so a well-placed card sits around 70% with clear air
   * on every side — which is what these checks were always looking for.
   */
  it("passes a card that fills most of the frame with margin — the well-aimed case", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [235, 235, 235]);
    paintTexturedRect(data, WIDTH, { x: 17, y: 10, w: 165, h: 105 }, [90, 130, 110]);
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.issue, null);
    assert.equal(result.ready, true);
    assert.ok(result.metrics.coverageRatio > 0.6);
    assert.equal(result.metrics.edgeTouchCount, 0);
  });

  /*
   * The rule the whole auto-capture flow depends on, stated as a provable
   * property rather than left implicit: "the CNIC is detected" is only one of
   * eight checks, so a card that is merely IN FRAME but poorly lit, blurry, or
   * glared must never read as ready. Sampled across every scenario this file
   * already builds, so a future change to any one check that quietly makes
   * `ready` depend on fewer signals fails here immediately.
   */
  it("is ready if and only if every individual check passed — detection alone is never enough", () => {
    const scenes: Uint8ClampedArray[] = [];

    let d = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    scenes.push(d); // no_card

    d = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    paintTexturedRect(d, WIDTH, { x: 65, y: 40, w: 70, h: 45 }, [90, 130, 110]);
    scenes.push(d); // detected, but too_far — the exact case the rule exists for

    d = makeCanvas(WIDTH, HEIGHT, [235, 235, 235]);
    paintFlatRect(d, WIDTH, { x: 40, y: 22, w: 120, h: 82 }, [90, 130, 110]);
    scenes.push(d); // detected AND well framed, but blurry

    scenes.push(wellFramedCard()); // every check passes

    for (const scene of scenes) {
      const result = analyzeCnicFrame(buffer(scene));
      const allChecksPassed = Object.values(result.checks).every(Boolean);
      assert.equal(
        result.ready,
        allChecksPassed,
        `ready=${result.ready} disagreed with checks=${JSON.stringify(result.checks)}`,
      );
      // Detection specifically must never be sufficient on its own.
      if (result.checks.detected && !allChecksPassed) {
        assert.equal(result.ready, false, "detected but not fully readable, yet reported ready");
      }
    }
  });

  /*
   * A washed-out webcam frame — the whole card blown to near-white by a
   * window or overhead light behind the citizen, not a small specular
   * highlight. Distinct from the existing "glare" test, which uses a
   * localised hotspot on an otherwise normal card; this is the frame
   * genuinely losing the print across most of its surface.
   */
  it("rejects a whole-frame overexposed webcam capture, not just a local hotspot", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [235, 235, 235]);
    // Near-white across almost the entire card — text has been blown out.
    paintTexturedRect(data, WIDTH, { x: 40, y: 22, w: 120, h: 82 }, [252, 252, 252], 4);
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.ready, false);
    // The specific reason a near-white frame gets rejected can legitimately
    // be sharpness, glare or readability depending on exactly how the clipping
    // lands — an overexposed sensor typically loses contrast-derived sharpness
    // too. What must hold is that it is a QUALITY complaint, never a framing
    // one: the card genuinely is there and in frame, that is not the problem.
    assert.ok(
      ["blurry", "glare", "unreadable", "low_light"].includes(result.issue ?? ""),
      `expected a quality-shaped rejection, got ${result.issue}`,
    );
  });

  /*
   * A cheap/built-in laptop webcam at native resolution: soft everywhere from
   * poor autofocus rather than motion blur, low overall contrast, analysed at
   * a smaller pixel count than a phone camera would give. This is the
   * concrete "laptop camera" scenario the capture gate has to hold up
   * against, not just a phone held steady.
   */
  it("rejects a low-resolution, poor-autofocus laptop webcam frame", () => {
    const width = 96;
    const height = 60;
    const data = makeCanvas(width, height, [225, 225, 225]);

    for (let y = 10; y < 50; y++) {
      for (let x = 18; x < 78; x++) {
        // Very low amplitude and low frequency: a genuinely out-of-focus lens,
        // not merely a lower-resolution but still-sharp image.
        const variation = 6 * Math.sin(x * 0.25) * Math.cos(y * 0.2);
        const i = (y * width + x) * 4;
        const value = 100 + variation;
        data[i] = value;
        data[i + 1] = value + 30;
        data[i + 2] = value + 15;
      }
    }

    const result = analyzeCnicFrame({ data, width, height });
    assert.equal(result.ready, false);
  });

  it("reports every check independently, not just the one that won", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    // Small and dim: distance fails, lighting fails, both must be visible.
    paintTexturedRect(data, WIDTH, { x: 85, y: 52, w: 60, h: 38 }, [45, 45, 45], 40);
    const result = analyzeCnicFrame(buffer(data));

    assert.equal(result.issue, "too_far");
    assert.equal(result.checks.distance, false);
    // The debug panel depends on this: the losing checks still report honestly.
    assert.equal(result.checks.complete, true);
    assert.equal(result.checks.detected, true);
  });

  it("checks framing before lighting — a dark AND poorly-framed scene reports the framing issue", () => {
    const data = makeCanvas(WIDTH, HEIGHT, [20, 20, 20]);
    // ~9% coverage (too_far band) and dim — framing must win the priority race.
    paintTexturedRect(data, WIDTH, { x: 85, y: 52, w: 60, h: 38 }, [45, 45, 45], 40);
    const result = analyzeCnicFrame(buffer(data));

    // Both "too dark" and "too small" are true here; framing takes priority
    // because there's no point telling someone about lighting on a card
    // that isn't positioned yet.
    assert.equal(result.issue, "too_far");
  });
});

/*
 * The readability score and the three-tier border colour.
 *
 * The property that matters most here is that the number and the colour can
 * never disagree — a citizen must never read "87%" beside a red frame, or
 * "42%" beside a green one. That is a structural guarantee of how the score is
 * built, so it is tested as one.
 */
describe("readability score and tier", () => {
  it("scores a well-framed card in the acceptable band and calls it green", () => {
    const result = analyzeCnicFrame(buffer(wellFramedCard()));

    assert.equal(result.tier, "acceptable");
    assert.ok(result.readability >= READABLE_THRESHOLD);
    assert.ok(result.readability <= 100);
  });

  it("keeps score and tier in agreement across every synthetic scene", () => {
    const scenes: Record<string, Uint8ClampedArray> = {};

    scenes.empty = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);

    scenes.tooFar = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    paintTexturedRect(scenes.tooFar, WIDTH, { x: 65, y: 40, w: 70, h: 45 }, [90, 130, 110]);

    scenes.tooClose = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    paintTexturedRect(
      scenes.tooClose,
      WIDTH,
      { x: 2, y: 2, w: WIDTH - 4, h: HEIGHT - 4 },
      [90, 130, 110],
    );

    scenes.dim = makeCanvas(WIDTH, HEIGHT, [5, 5, 5]);
    paintTexturedRect(scenes.dim, WIDTH, { x: 40, y: 22, w: 120, h: 82 }, [55, 55, 55], 30);

    scenes.glare = wellFramedCard();
    paintGlarePatch(scenes.glare, WIDTH, { x: 70, y: 30, w: 90, h: 60 });

    scenes.good = wellFramedCard();

    for (const [name, data] of Object.entries(scenes)) {
      const { readability, tier, ready } = analyzeCnicFrame(buffer(data));

      const expected =
        readability >= READABLE_THRESHOLD
          ? "acceptable"
          : readability >= IMPROVING_THRESHOLD
            ? "improving"
            : "poor";

      assert.equal(tier, expected, `${name}: tier disagrees with score`);
      // Green and "ready to capture" are the same statement, always.
      assert.equal(tier === "acceptable", ready, `${name}: tier disagrees with ready`);
    }
  });

  it("never reports orange for an empty frame — nothing is nearly-good about no card", () => {
    const result = analyzeCnicFrame(buffer(makeCanvas(WIDTH, HEIGHT, [230, 230, 230])));

    assert.equal(result.tier, "poor");
    assert.ok(result.readability < IMPROVING_THRESHOLD);
  });

  /*
   * Spec §4: a card that is absent, too far, too close or half out of shot is
   * red, not orange, however clean the rest of the photo is. Orange is reserved
   * for a well-placed card whose *quality* needs work.
   */
  it("keeps framing failures red and quality failures orange", () => {
    const tooFar = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    paintTexturedRect(tooFar, WIDTH, { x: 65, y: 40, w: 70, h: 45 }, [90, 130, 110]);
    assert.equal(analyzeCnicFrame(buffer(tooFar)).tier, "poor");

    const cutOff = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    paintTexturedRect(cutOff, WIDTH, { x: 0, y: 0, w: 140, h: 88 }, [90, 130, 110]);
    assert.equal(analyzeCnicFrame(buffer(cutOff)).tier, "poor");

    // Well placed, but with a glare hotspot big enough to swallow a field.
    const glared = wellFramedCard();
    paintGlarePatch(glared, WIDTH, { x: 70, y: 30, w: 90, h: 60 });
    const glareResult = analyzeCnicFrame(buffer(glared));
    assert.equal(glareResult.issue, "glare");
    assert.equal(glareResult.tier, "improving");
  });

  /*
   * The gauge's green band is drawn at fixed coordinates in the UI, so the
   * mapping has to guarantee those coordinates mean what they say.
   */
  it("puts an acceptable card inside the gauge's marked band, and a bad one outside", () => {
    const good = analyzeCnicFrame(buffer(wellFramedCard()));
    assert.ok(good.distance >= DISTANCE_BAND_MIN && good.distance <= DISTANCE_BAND_MAX);

    const far = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    paintTexturedRect(far, WIDTH, { x: 65, y: 40, w: 70, h: 45 }, [90, 130, 110]);
    assert.ok(analyzeCnicFrame(buffer(far)).distance < DISTANCE_BAND_MIN);

    const close = makeCanvas(WIDTH, HEIGHT, [230, 230, 230]);
    paintTexturedRect(close, WIDTH, { x: 2, y: 2, w: WIDTH - 4, h: HEIGHT - 4 }, [90, 130, 110]);
    assert.ok(analyzeCnicFrame(buffer(close)).distance > DISTANCE_BAND_MAX);
  });

  it("moves the score upward as a frame genuinely improves", () => {
    // The same card, photographed with progressively more printed contrast.
    const scores = [4, 12, 30, 60].map((amplitude) => {
      const data = makeCanvas(WIDTH, HEIGHT, [235, 235, 235]);
      paintTexturedRect(data, WIDTH, { x: 40, y: 22, w: 120, h: 82 }, [90, 130, 110], amplitude);
      return analyzeCnicFrame(buffer(data)).readability;
    });

    for (let i = 1; i < scores.length; i++) {
      assert.ok(
        scores[i] >= scores[i - 1],
        `score fell from ${scores[i - 1]} to ${scores[i]} as the frame improved`,
      );
    }
  });
});
