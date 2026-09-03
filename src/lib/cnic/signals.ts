import type { FrameQualityResult } from "@/lib/cnic-frame-quality";
import type { QualitySignals } from "@/lib/cnic/validation";

/*
 * Turns the raw pixel measurements into the normalised 0–1 signals the shared
 * validator consumes.
 *
 * The measurements themselves stay in cnic-frame-quality.ts, which knows about
 * luminance and edges. This file knows what those numbers MEAN for readability,
 * and it exists so the camera and the server score an image on exactly the same
 * axes — the defect being fixed was a camera judging a live frame on one scale
 * and nothing at all judging the photograph it produced.
 *
 * Every mapping below is a ramp between a floor (0 — hopeless) and a ceiling
 * (1 — no longer the limiting factor), rather than a pass/fail threshold. A
 * single cliff-edge cutoff is what made the old behaviour so brittle: an image
 * one unit above the blur threshold and one a hundred units above scored
 * identically, so "sharp enough to capture" carried no information about
 * whether the text could actually be read.
 */

/** Linear ramp, clamped. `floor` scores 0, `ceiling` and above score 1. */
function ramp(value: number, floor: number, ceiling: number): number {
  if (!Number.isFinite(value)) return 0;
  if (ceiling <= floor) return value >= ceiling ? 1 : 0;
  return Math.max(0, Math.min(1, (value - floor) / (ceiling - floor)));
}

/** Inverse ramp: `floor` scores 1, `ceiling` and above score 0. */
function inverseRamp(value: number, floor: number, ceiling: number): number {
  return 1 - ramp(value, floor, ceiling);
}

export function qualitySignalsFrom(result: FrameQualityResult): QualitySignals {
  const { metrics, checks } = result;

  /*
   * Document confidence combines "is something card-shaped there" with "is it
   * big enough to resolve print". Coverage below 0.16 is the old too-far
   * threshold; 0.45 is where a card comfortably fills the guide.
   */
  const documentConfidence = checks.detected
    ? ramp(metrics.coverageRatio, 0.1, 0.45)
    : 0;

  /*
   * Sharpness is the signal that actually decides whether characters resolve.
   *
   * The ceiling is calibrated against REAL VIDEO, not against the synthetic
   * hard-edged patterns this measurement was originally tuned on. A live feed
   * is inherently softer — compression, auto-exposure, a lens that is not
   * macro-focused — so a perfectly good webcam frame of a CNIC lands around
   * 5–7 here, not 9. An earlier ceiling of 9 meant a clear card scored ~0.36
   * on this axis and the total could never reach the capture bar, so the
   * shutter never fired at any distance. The floor stays where the old
   * pass/fail threshold was: below 2.0 is genuine motion blur.
   */
  const sharpness = ramp(metrics.sharpness, 2.0, 6.5);

  /*
   * Brightness is judged in both directions. A blown-out card is as unreadable
   * as a dark one, and the old check only looked for darkness.
   */
  const lighting =
    metrics.brightness < 110
      ? ramp(metrics.brightness, 35, 110)
      : inverseRamp(metrics.brightness, 205, 245);

  const glareFree = inverseRamp(metrics.glareRatio, 0.03, 0.18);

  const perspective =
    // An unmeasurable tilt is not evidence of a bad tilt. Penalising the
    // unknown case to 0.7 quietly cost every frame 2-3 points of score.
    metrics.tiltDegrees === null ? 0.85 : inverseRamp(Math.abs(metrics.tiltDegrees), 6, 30);

  /*
   * Completeness: a card touching the frame edges is being cut off, and each
   * touched edge costs a quarter of the score. Text detail is folded in
   * because a "complete" card with no resolvable print is not a usable card.
   */
  const edgePenalty = Math.min(1, metrics.edgeTouchCount / 4);
  const completeness =
    (1 - edgePenalty) * 0.6 +
    ramp(metrics.textDetail, 0.006, 0.045) * 0.25 +
    inverseRamp(metrics.coverageRatio, 0.88, 0.99) * 0.15;

  return {
    documentConfidence,
    sharpness,
    lighting,
    glareFree,
    perspective,
    completeness,
  };
}
