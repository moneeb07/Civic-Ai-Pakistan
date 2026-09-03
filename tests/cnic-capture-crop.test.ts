import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { captureCropFor, CROP_MARGIN, type Rect } from "../src/lib/cnic-capture-crop";

/*
 * Capture used to upload the whole camera frame. On a portrait phone the CNIC
 * guide is ~86% of the frame's WIDTH but, because a 1.586:1 card sits inside a
 * ~0.56:1 frame, only about a sixth of its AREA — and the frame was then
 * downscaled to a fixed long edge before upload. The card therefore arrived at
 * the model at roughly a third of the resolution the upload budget allowed,
 * with the rest spent on the desk around it.
 *
 * A name in 3mm type survives that. The Urdu address on the back, which is the
 * smallest print on the card, does not. These tests pin the geometry that
 * spends the budget on the card instead.
 */

/** The same guide the camera component draws: centred, 86% of the width, 1.586:1. */
function guideFor(width: number, height: number): Rect {
  const w = Math.min(width * 0.86, height * 0.86 * 1.586);
  const h = w / 1.586;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

describe("captureCropFor", () => {
  // -- The point of the whole exercise ------------------------------------
  it("crops away most of a portrait frame, keeping the card", () => {
    const display = { width: 1080, height: 1920 };
    const source = { width: 1080, height: 1920 };
    const crop = captureCropFor(guideFor(1080, 1920), display, source);

    const frameArea = source.width * source.height;
    const cropArea = crop.w * crop.h;

    assert.ok(
      cropArea < frameArea * 0.4,
      `expected the crop to discard most of the frame, kept ${((cropArea / frameArea) * 100).toFixed(0)}%`,
    );
  });

  it("more than doubles the card's share of the uploaded pixels", () => {
    const display = { width: 1080, height: 1920 };
    const source = { width: 1080, height: 1920 };
    const guide = guideFor(1080, 1920);
    const crop = captureCropFor(guide, display, source);

    const guideArea = guide.w * guide.h;
    const beforeShare = guideArea / (source.width * source.height);
    const afterShare = guideArea / (crop.w * crop.h);

    assert.ok(
      afterShare > beforeShare * 2,
      `card share should more than double: ${beforeShare.toFixed(3)} -> ${afterShare.toFixed(3)}`,
    );
    // The margin is the only thing left around the card, so the card should
    // dominate the upload outright.
    assert.ok(afterShare > 0.7, `card should fill the crop, got ${afterShare.toFixed(3)}`);
  });

  // -- It keeps a margin --------------------------------------------------
  /*
   * Never crops exactly to the guide. A citizen aligns a card they are holding
   * by eye, so its true edges routinely sit slightly outside the guide —
   * cropping tight would shave the first or last character off a line.
   */
  it("keeps a margin around the guide rather than cutting to it exactly", () => {
    const display = { width: 1000, height: 1000 };
    const guide = guideFor(1000, 1000);
    const crop = captureCropFor(guide, display, { width: 1000, height: 1000 });

    assert.ok(crop.w > guide.w, "crop should be wider than the guide");
    assert.ok(crop.h > guide.h, "crop should be taller than the guide");

    // Within a pixel of the declared margin on each side.
    assert.ok(Math.abs(crop.w - guide.w * (1 + CROP_MARGIN * 2)) <= 1);
    assert.ok(Math.abs(crop.h - guide.h * (1 + CROP_MARGIN * 2)) <= 1);
  });

  it("stays centred on the card", () => {
    const display = { width: 1080, height: 1920 };
    const guide = guideFor(1080, 1920);
    const crop = captureCropFor(guide, display, { width: 1080, height: 1920 });

    const guideCentreX = guide.x + guide.w / 2;
    const guideCentreY = guide.y + guide.h / 2;
    const cropCentreX = crop.x + crop.w / 2;
    const cropCentreY = crop.y + crop.h / 2;

    assert.ok(Math.abs(cropCentreX - guideCentreX) <= 1, "crop drifted horizontally");
    assert.ok(Math.abs(cropCentreY - guideCentreY) <= 1, "crop drifted vertically");
  });

  // -- Display and source differ ------------------------------------------
  /*
   * The guide is drawn in DISPLAY coordinates, but the crop has to be taken
   * from SOURCE pixels. The two are rarely the same size — the preview canvas
   * is capped well below a modern camera's resolution — and getting this
   * mapping wrong crops the wrong part of the frame entirely.
   */
  it("maps the guide into source pixels when the source is larger than the display", () => {
    const display = { width: 540, height: 960 };
    const source = { width: 1080, height: 1920 };
    const crop = captureCropFor(guideFor(540, 960), display, source);

    // Same aspect ratio, exactly 2x scale: the crop should be twice the size
    // of the equivalent crop taken at display resolution.
    const atDisplay = captureCropFor(guideFor(540, 960), display, {
      width: 540,
      height: 960,
    });

    assert.ok(Math.abs(crop.w - atDisplay.w * 2) <= 2, "crop width did not scale with the source");
    assert.ok(Math.abs(crop.h - atDisplay.h * 2) <= 2, "crop height did not scale with the source");
  });

  it("accounts for the cover-crop when display and source aspect ratios differ", () => {
    // A 4:3 camera shown in a tall portrait viewport: the sides are cut off.
    const display = { width: 900, height: 1600 };
    const source = { width: 1600, height: 1200 };
    const crop = captureCropFor(guideFor(900, 1600), display, source);

    assert.ok(crop.x >= 0 && crop.y >= 0, "crop origin fell outside the frame");
    assert.ok(crop.x + crop.w <= source.width, "crop ran past the right edge");
    assert.ok(crop.y + crop.h <= source.height, "crop ran past the bottom edge");
    assert.ok(crop.w > 0 && crop.h > 0, "crop collapsed to nothing");
  });

  // -- Always inside the frame --------------------------------------------
  /*
   * A crop with a negative origin, or one running past an edge, silently
   * produces a blank or truncated image on a real canvas rather than throwing.
   * That is the kind of bug that reaches a citizen as "scanning just stopped
   * working", so it is worth proving across a spread of shapes.
   */
  it("always returns a rectangle inside the source frame", () => {
    const sizes = [
      { width: 640, height: 480 },
      { width: 1920, height: 1080 },
      { width: 720, height: 1280 },
      { width: 1080, height: 1080 },
      { width: 320, height: 240 },
      { width: 3840, height: 2160 },
    ];

    for (const display of sizes) {
      for (const source of sizes) {
        const crop = captureCropFor(guideFor(display.width, display.height), display, source);
        const label = `display ${display.width}x${display.height} source ${source.width}x${source.height}`;

        assert.ok(crop.x >= 0, `${label}: negative x`);
        assert.ok(crop.y >= 0, `${label}: negative y`);
        assert.ok(crop.w > 0 && crop.h > 0, `${label}: empty crop`);
        assert.ok(crop.x + crop.w <= source.width, `${label}: overflows width`);
        assert.ok(crop.y + crop.h <= source.height, `${label}: overflows height`);
      }
    }
  });

  it("returns whole-number pixel coordinates", () => {
    const crop = captureCropFor(
      guideFor(1001, 1777),
      { width: 1001, height: 1777 },
      { width: 1001, height: 1777 },
    );

    for (const [name, value] of Object.entries(crop)) {
      assert.equal(value, Math.round(value), `${name} is not a whole number of pixels`);
    }
  });

  // -- Degenerate input ----------------------------------------------------
  /*
   * A video element reports 0x0 until its metadata loads. Capture guards
   * against that already, but this must not divide by zero if it ever slips
   * through — it should fall back to the whole frame, not produce NaN.
   */
  it("falls back to the whole frame rather than dividing by zero", () => {
    const crop = captureCropFor(
      { x: 0, y: 0, w: 10, h: 10 },
      { width: 0, height: 0 },
      { width: 640, height: 480 },
    );

    assert.deepEqual(crop, { x: 0, y: 0, w: 640, h: 480 });
    assert.ok(Number.isFinite(crop.w) && Number.isFinite(crop.h));
  });

  it("does not produce NaN for a zero-sized source", () => {
    const crop = captureCropFor(
      { x: 0, y: 0, w: 10, h: 10 },
      { width: 100, height: 100 },
      { width: 0, height: 0 },
    );

    for (const value of Object.values(crop)) {
      assert.ok(Number.isFinite(value), "crop contains a non-finite value");
    }
  });
});
