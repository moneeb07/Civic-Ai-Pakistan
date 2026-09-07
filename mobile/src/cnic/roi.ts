import { Dimensions } from "react-native";

/*
 * Geometry of the CNIC guide box.
 *
 * This file used to be shared between the overlay and a native frame
 * processor, and carried the extra constants that second reader needed —
 * screen dimensions in buffer space, a detector sampling pad, a crop margin.
 * The detector is gone (see auto-camera.tsx for why), so what remains is the
 * one thing that was always the point: where to draw the box.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// A CNIC (ID-1 format, 85.6 × 54 mm) is 1.585:1.
const CARD_ASPECT = 85.6 / 54;

/*
 * The guide box, as fractions of the screen.
 *
 * The HEIGHT is derived from the width so the box renders as a real 1.585:1
 * card shape rather than a fixed fraction of screen height. That is not
 * cosmetic: a box that isn't card-shaped makes "fit the card in the box" an
 * impossible instruction, because the citizen can line up the top and bottom
 * or the sides, never both.
 */
const W = 0.84;
const H = (W * SCREEN_W) / CARD_ASPECT / SCREEN_H;

export const ROI = {
  x: (1 - W) / 2,
  y: (1 - H) / 2,
  w: W,
  h: H,
} as const;
