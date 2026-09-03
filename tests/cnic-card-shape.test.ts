import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeCnicFrame, measureCardShape } from "../src/lib/cnic-frame-quality";

/*
 * The camera photographed a person's face, with a green border, without ever
 * asking whether it was looking at a card.
 *
 * "Detected" meant nothing more than `coverageRatio >= 0.05` — more than five
 * percent of the frame differs from the background. A head in front of a wall
 * satisfies that completely, so the quality score went on to rate the face as
 * a fine, sharp, well-lit, well-framed subject, the guide turned green, and
 * the shutter fired.
 *
 * A CNIC is geometrically distinctive in two ways a head is not: it is a
 * 1.586:1 LANDSCAPE rectangle, and being a rectangle it FILLS its own bounding
 * box. These tests build both shapes out of raw pixels and check the detector
 * can tell them apart.
 */

const BACKGROUND: [number, number, number] = [235, 235, 232];
const SUBJECT: [number, number, number] = [70, 95, 85];

/** A blank scene the shapes below are drawn into. */
function scene(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = BACKGROUND[0];
    data[p * 4 + 1] = BACKGROUND[1];
    data[p * 4 + 2] = BACKGROUND[2];
    data[p * 4 + 3] = 255;
  }
  return { data, width, height };
}

function fillPixel(buffer: ReturnType<typeof scene>, x: number, y: number) {
  const i = (y * buffer.width + x) * 4;
  buffer.data[i] = SUBJECT[0];
  buffer.data[i + 1] = SUBJECT[1];
  buffer.data[i + 2] = SUBJECT[2];
}

/** A solid ID-1 rectangle: 1.586:1, filling its bounding box. */
function drawCard(width = 240, height = 180) {
  const buffer = scene(width, height);
  const cardWidth = Math.round(width * 0.7);
  const cardHeight = Math.round(cardWidth / 1.586);
  const x0 = Math.round((width - cardWidth) / 2);
  const y0 = Math.round((height - cardHeight) / 2);

  for (let y = y0; y < y0 + cardHeight; y++) {
    for (let x = x0; x < x0 + cardWidth; x++) fillPixel(buffer, x, y);
  }
  return buffer;
}

/** A head: an upright ellipse, taller than wide, with empty corners. */
function drawHead(width = 240, height = 180) {
  const buffer = scene(width, height);
  const cx = width / 2;
  const cy = height / 2;
  // Taller than wide, as a head is.
  const rx = width * 0.2;
  const ry = height * 0.36;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) fillPixel(buffer, x, y);
    }
  }
  return buffer;
}

/** Builds the foreground mask the shape test consumes. */
function maskOf(buffer: ReturnType<typeof scene>) {
  const mask = new Uint8Array(buffer.width * buffer.height);
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    const distance =
      Math.abs(buffer.data[i]! - BACKGROUND[0]) +
      Math.abs(buffer.data[i + 1]! - BACKGROUND[1]) +
      Math.abs(buffer.data[i + 2]! - BACKGROUND[2]);
    mask[p] = distance > 40 ? 1 : 0;
  }
  return mask;
}

describe("measureCardShape", () => {
  it("recognises a solid ID-1 rectangle as card-like", () => {
    const buffer = drawCard();
    const shape = measureCardShape(maskOf(buffer), buffer.width, buffer.height);

    assert.equal(shape.cardLike, true, `aspect ${shape.aspect}, fill ${shape.fill}`);
    assert.ok(shape.aspect !== null && Math.abs(shape.aspect - 1.586) < 0.15);
    assert.ok(shape.fill > 0.95, "a rectangle fills its own bounding box");
  });

  // -- The reported bug -----------------------------------------------------
  it("rejects a head as not card-like", () => {
    const buffer = drawHead();
    const shape = measureCardShape(maskOf(buffer), buffer.width, buffer.height);

    assert.equal(
      shape.cardLike,
      false,
      `a face was accepted as a card: aspect ${shape.aspect}, fill ${shape.fill}`,
    );
  });

  it("rejects a head on its ASPECT, which is what actually separates the two", () => {
    /*
     * Aspect, not fill, is the discriminator — and the arithmetic is
     * counter-intuitive enough to pin here. An ellipse fills π/4 ≈ 0.785 of
     * its bounding box at any rotation, while a card tilted 15° fills only
     * 0.64. So a fill threshold strict enough to exclude a head would reject
     * most real hand-held cards. A face is simply taller than it is wide.
     */
    const buffer = drawHead();
    const shape = measureCardShape(maskOf(buffer), buffer.width, buffer.height);

    assert.ok(
      shape.aspect !== null && shape.aspect < 1.08,
      `a face is not landscape, got aspect ${shape.aspect}`,
    );
  });

  it("still accepts a card tilted well off square", () => {
    /*
     * The counterpart, and the reason fill cannot be strict: a hand-held card
     * is never square to the lens, and its axis-aligned bounding box grows
     * quickly with tilt. This must not be mistaken for "not a card".
     */
    const buffer = scene(260, 200);
    const cx = 130;
    const cy = 100;
    const halfWidth = 75;
    const halfHeight = halfWidth / 1.586;
    const angle = (18 * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 260; x++) {
        // Rotate the point back into the card's own frame.
        const dx = x - cx;
        const dy = y - cy;
        const localX = dx * cos + dy * sin;
        const localY = -dx * sin + dy * cos;
        if (Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight) {
          fillPixel(buffer, x, y);
        }
      }
    }

    const shape = measureCardShape(maskOf(buffer), buffer.width, buffer.height);
    assert.equal(
      shape.cardLike,
      true,
      `a tilted card must still read as a card: aspect ${shape.aspect}, fill ${shape.fill}`,
    );
  });

  it("reports nothing for an empty frame rather than throwing", () => {
    const buffer = scene(120, 90);
    const shape = measureCardShape(maskOf(buffer), buffer.width, buffer.height);

    assert.equal(shape.aspect, null);
    assert.equal(shape.fill, 0);
    assert.equal(shape.cardLike, false);
  });
});

/** A card with a hand gripping its left edge — what the mask really contains. */
function drawCardInHand(width = 240, height = 180) {
  const buffer = scene(width, height);

  const cardWidth = Math.round(width * 0.62);
  const cardHeight = Math.round(cardWidth / 1.586);
  const x0 = Math.round((width - cardWidth) / 2) + 12;
  const y0 = Math.round((height - cardHeight) / 2);

  for (let y = y0; y < y0 + cardHeight; y++) {
    for (let x = x0; x < x0 + cardWidth; x++) fillPixel(buffer, x, y);
  }

  // Fingers and a thumb overlapping the left edge, plus a wrist below.
  for (let f = 0; f < 3; f++) {
    const fy = y0 + 8 + f * 18;
    for (let y = fy; y < fy + 12 && y < height; y++) {
      for (let x = x0 - 26; x < x0 + 8; x++) {
        if (x >= 0) fillPixel(buffer, x, y);
      }
    }
  }
  for (let y = y0 + cardHeight - 4; y < height; y++) {
    for (let x = x0 - 30; x < x0 + 6; x++) if (x >= 0) fillPixel(buffer, x, y);
  }

  return buffer;
}

describe("analyzeCnicFrame — detection requires a card, not a subject", () => {
  it("detects a card", () => {
    assert.equal(analyzeCnicFrame(drawCard()).checks.detected, true);
  });

  /*
   * The regression this suite originally MISSED, and which reached the user.
   *
   * The first version of the shape gate demanded the foreground be a clean
   * 1.586:1 filled rectangle. But classifyForeground marks every pixel that
   * differs from the background, so the blob is the card AND the hand holding
   * it — never a clean rectangle. Detection became permanently false, which
   * zeroed documentConfidence, tripped the prerequisite cap, and pinned the
   * guide to red at every distance. The tests all passed because every fixture
   * was an isolated shape on a clean background.
   */
  it("detects a card that is being HELD, hand and all", () => {
    const result = analyzeCnicFrame(drawCardInHand());

    assert.equal(
      result.checks.detected,
      true,
      "a hand holding a card must still count as a card in frame",
    );
  });

  /*
   * The whole point. Before the shape test, this returned `detected: true`,
   * the score rated the face highly on every other axis, the border went
   * green, and the camera took a photograph of somebody's head.
   */
  it("does NOT detect a face as a CNIC", () => {
    const result = analyzeCnicFrame(drawHead());

    assert.equal(result.checks.detected, false, "a face must never read as a card");
    assert.equal(result.ready, false, "and must never be capture-ready");
  });

  it("does not detect an empty frame", () => {
    assert.equal(analyzeCnicFrame(scene(240, 180)).checks.detected, false);
  });
});
