/*
 * Which pixels of the camera frame actually get uploaded.
 *
 * The bug this exists to fix is subtle and cost the address feature outright.
 * Capture used to upload the ENTIRE video frame. On a portrait phone camera
 * the CNIC guide occupies about 86% of the width but, because the card is a
 * 1.586:1 landscape rectangle inside a roughly 0.5:1 portrait frame, only
 * about a sixth of the frame's AREA. The whole frame was then downscaled to a
 * 1600px long edge before upload — so the card itself arrived at Gemini around
 * 770px wide, with the rest of the budget spent on the desk it was lying on.
 *
 * A name in 3mm type survives that. The address does not: it is the smallest
 * print on the card, it is Urdu, and its diacritics are exactly the detail
 * that a downscale destroys first. "The AI cannot read the address" was, in
 * large part, "the AI was never sent enough pixels of the address".
 *
 * Cropping to the guide before encoding spends the entire resolution budget on
 * the card, which is roughly a 2.5x gain in linear detail on the printed text
 * for no extra upload size.
 *
 * Pure and framework-free: no canvas, no DOM, so the geometry is testable.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How much wider than the on-screen guide the uploaded crop is, per side.
 *
 * Not zero, for two reasons. A citizen aligns the card to the guide by eye
 * while holding it, so the true edges sit a little outside it more often than
 * not — cropping exactly to the guide would shave the first or last character
 * off a line. And the model reads a card better with a visible border than one
 * bled to the frame edge, because the card's own edge is what tells it where
 * the document is.
 */
export const CROP_MARGIN = 0.08;

/**
 * The region of the source frame to upload, given the on-screen guide.
 *
 * The guide is expressed in the coordinates of the DISPLAYED canvas, which is
 * a cover-crop of the source video and generally a different size, so the
 * scale and letterbox offsets between the two have to be undone before the
 * rectangle means anything in source pixels.
 *
 * Always returns a rectangle inside the frame: clamping matters because a
 * guide near an edge plus the margin can easily fall outside it, and a crop
 * with a negative origin silently yields a blank image on a real canvas.
 */
export function captureCropFor(
  guide: Rect,
  display: { width: number; height: number },
  source: { width: number; height: number },
): Rect {
  if (source.width <= 0 || source.height <= 0 || display.width <= 0 || display.height <= 0) {
    return { x: 0, y: 0, w: Math.max(0, source.width), h: Math.max(0, source.height) };
  }

  /*
   * The same cover-crop the preview uses: the source is scaled by whichever
   * axis needs the LARGER factor to fill the display, and the overflow on the
   * other axis is centred and cut off.
   */
  const scale = Math.max(display.width / source.width, display.height / source.height);
  const drawnWidth = source.width * scale;
  const drawnHeight = source.height * scale;
  const offsetX = (display.width - drawnWidth) / 2;
  const offsetY = (display.height - drawnHeight) / 2;

  // Undo that mapping to land back in source pixels.
  const inSource: Rect = {
    x: (guide.x - offsetX) / scale,
    y: (guide.y - offsetY) / scale,
    w: guide.w / scale,
    h: guide.h / scale,
  };

  const marginX = inSource.w * CROP_MARGIN;
  const marginY = inSource.h * CROP_MARGIN;

  const x = inSource.x - marginX;
  const y = inSource.y - marginY;
  const w = inSource.w + marginX * 2;
  const h = inSource.h + marginY * 2;

  // Clamp into the frame, keeping as much of the requested region as fits.
  const clampedW = Math.min(w, source.width);
  const clampedH = Math.min(h, source.height);

  return {
    x: Math.round(Math.max(0, Math.min(source.width - clampedW, x))),
    y: Math.round(Math.max(0, Math.min(source.height - clampedH, y))),
    w: Math.round(clampedW),
    h: Math.round(clampedH),
  };
}
