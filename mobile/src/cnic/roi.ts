import { Dimensions } from "react-native";

/*
 * Geometry of the CNIC guide box. Ported from the reference auto-capture
 * project — the comments explaining WHY each number is what it is are kept,
 * because every one of them is load-bearing for the detector.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// Exported so the frame processor can map the on-screen box into frame
// coordinates. Read once at module load, which is what lets a worklet close
// over them.
export const SCREEN = { w: SCREEN_W, h: SCREEN_H } as const;

// A CNIC (ID-1 format, 85.6 × 54 mm) is 1.585:1.
export const CARD_ASPECT = 85.6 / 54;

// Single source of truth for the CNIC guide box, expressed as fractions of
// the frame. Used by the overlay (what the user sees), the frame processor
// (what gets analysed), and the capture crop (what gets saved) — keeping all
// three in agreement is what makes "the box you see is the region that gets
// captured" actually true.
//
// The HEIGHT is derived from the width so the box renders as a real 1.585:1
// card shape rather than a fixed fraction of screen height. A box that isn't
// card-shaped is not just cosmetic: it makes "fit the card in the box" an
// impossible instruction — the user can line up the top and bottom or the
// sides, never both — and the detector then measures a rectangle whose
// proportions don't match a card.
//
// The box is also centred on BOTH axes. That is load-bearing too: the
// frame-processor buffer is usually landscape even when the phone is held
// portrait, so the ROI has to be rotated into buffer space, and a box centred
// on both axes maps to the same rectangle whether that rotation is clockwise
// or anti-clockwise. So the detector doesn't have to guess the sensor's
// rotation direction to look in the right place.
const W = 0.84;
const H = (W * SCREEN_W) / CARD_ASPECT / SCREEN_H;

export const ROI = {
  x: (1 - W) / 2,
  y: (1 - H) / 2,
  w: W,
  h: H,
} as const;

// Small outward margin applied only when cropping the final photo, so the
// card's edges aren't clipped if it's held slightly outside the guide box.
export const CROP_MARGIN = 0.03;

// How far outside the box the detector samples, as a fraction of the box.
// This margin band is the background the card gets compared against.
export const DETECT_PAD = 0.06;

/** What the frame processor reports back for each analysed frame. */
export interface DetectionResult {
  aligned: boolean;
  brightness: number;
  contrast: number;
  variance: number;
  borderStep: number;
  consistency: number;
  aspect: number;
  fill: number;
  contrastOk: boolean;
  flatEnough: boolean;
  borderClear: boolean;
  litOk: boolean;
  sizeOk: boolean;
  aspectOk: boolean;
  /** Coarse interior samples, compared frame-to-frame to detect movement. */
  sig: number[] | null;
}
