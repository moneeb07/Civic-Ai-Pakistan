import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeCnicFrame, type RgbaBuffer } from "../src/lib/cnic-frame-quality";

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
