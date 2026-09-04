import { useResizePlugin } from "vision-camera-resize-plugin";
import type { Frame } from "react-native-vision-camera";

import { ROI, DETECT_PAD, SCREEN, type DetectionResult } from "./roi";

/**
 * useCardDetector
 *
 * Returns a worklet that analyses each camera frame and decides whether a
 * CNIC is present and well-placed inside the overlay rectangle. Runs fully
 * on-device on the frame-processor thread — no image ever leaves the phone
 * to decide when to press the shutter.
 *
 * The approach is to LOCATE the card rather than assume it fills the guide
 * box. Earlier versions measured brightness steps at the box border, which
 * only worked if the card's edges lined up with that border exactly — hold
 * the card a bit small and every border reads as background-against-
 * background, i.e. no edge at all. Instead:
 *
 *   1. Take row/column brightness profiles across the box and find where the
 *      bright object starts and stops. That's the card's bounding box.
 *   2. Sanity-check that rectangle: is it a decent size, and is its aspect
 *      ratio near a CNIC's 1.585:1?
 *   3. Measure the brightness step across its four found edges — all four
 *      must step the same way, consistently along their length. This is what
 *      separates a real rectangular object from patterned texture, which
 *      produces equally large jumps but in random directions.
 *
 * Everything is scale- and position-tolerant, so the card can sit anywhere
 * in the box at any reasonable size.
 */

// ---- Tuning knobs ------------------------------------------------------
// These hot-reload, so they're safe to nudge while the app is running.

/*
 * Loosened from the reference project's values below. That project tuned
 * against a webcam bolted above a desk — fixed distance, fixed lighting, a
 * card someone had time to lay flat and square. A phone in someone's hand
 * has none of that: the distance drifts, the angle drifts, indoor lighting is
 * far less even, and holding a rectangle exactly square to a lens for three
 * seconds is genuinely fiddly. The original numbers made the trigger feel
 * "rigid" — technically correct, practically unusable — so every gate below
 * is relaxed enough to forgive a handheld phone without accepting something
 * that plainly isn't a card. If it ever proves TOO forgiving in practice,
 * these are the seven numbers to tighten back up, one at a time.
 */

// How different the card must be from the background around it. Either
// direction counts: the card may sit on something darker or lighter.
const MIN_CONTRAST = 5;

// Minimum average brightness step across EACH of the card's four found
// edges, and the minimum fraction of samples along an edge that must step
// the same way as that edge's average. A straight edge approaches 1.0;
// random texture hovers near 0.5, because there the sign is a coin flip.
const MIN_SIDE_STEP = 3;
const MIN_SIDE_CONSISTENCY = 0.48;

// Ceiling on variance inside the card. Much higher than a webcam prototype
// would need: held close to a phone the card fills the box with its photo,
// text, chip and green pattern. A real CNIC measures around 7000 here.
const MAX_INTERIOR_VAR = 20000;

// The found rectangle must fill at least this fraction of the box on both
// axes — stops a small bright speck from passing as a card.
const MIN_FILL = 0.28;

// A CNIC is 1.585:1. Checked on the long/short ratio so it holds whichever
// way round the sensor buffer is rotated.
const ASPECT_MIN = 1.05;
const ASPECT_MAX = 2.4;

// Acceptable exposure range for the card face.
const MIN_LUM = 35;
const MAX_LUM = 255;

export function useCardDetector(): (frame: Frame) => DetectionResult {
  const { resize } = useResizePlugin();

  const GRID_W = 48; // down-sampled analysis width
  const GRID_H = 32; // down-sampled analysis height

  const detect = (frame: Frame): DetectionResult => {
    "worklet";

    const fw = frame.width;
    const fh = frame.height;

    // ---- Map the on-screen box into frame coordinates -------------------
    // The ROI is authored in SCREEN space, where `w` is a fraction of screen
    // width and `h` a fraction of screen height. Applying those same
    // fractions straight to the frame would describe a differently-shaped
    // rectangle whenever the frame's aspect differs from the screen's — the
    // box the user aims at and the region analysed would not match, and a
    // perfectly placed card would measure the wrong aspect ratio.
    //
    // The preview scales the frame to COVER the screen, so part of the frame
    // is cropped away off-screen. Work out how much, then convert.
    const dfw = fw > fh ? fh : fw; // frame size as displayed (portrait)
    const dfh = fw > fh ? fw : fh;
    const aFrame = dfw / dfh;
    const aScreen = SCREEN.w / SCREEN.h;

    let visW = 1; // fraction of the frame actually visible on screen
    let visH = 1;
    if (aFrame > aScreen) visW = aScreen / aFrame; // wider than screen: sides cropped
    else visH = aFrame / aScreen; // taller than screen: top/bottom cropped

    const dx = (1 - visW) / 2 + ROI.x * visW;
    const dy = (1 - visH) / 2 + ROI.y * visH;
    const dw = ROI.w * visW;
    const dh = ROI.h * visH;

    // On Android the buffer is typically landscape however the phone is held,
    // so a wide on-screen box is a TALL box in buffer space. Because the ROI
    // is centred on both axes, this rotation is correct for either sensor
    // rotation direction.
    let rx = dx;
    let ry = dy;
    let rw = dw;
    let rh = dh;
    if (fw > fh) {
      rx = dy;
      ry = dx;
      rw = dh;
      rh = dw;
    }

    // Sample a region slightly LARGER than the box, so there is always some
    // background to compare the card against even when it fills the box.
    const pad = DETECT_PAD;
    const sx = Math.max(0, rx - pad * rw);
    const sy = Math.max(0, ry - pad * rh);
    const sw = Math.min(1 - sx, rw * (1 + 2 * pad));
    const sh = Math.min(1 - sy, rh * (1 + 2 * pad));

    const fail: DetectionResult = {
      aligned: false,
      brightness: 0,
      contrast: 0,
      variance: 0,
      borderStep: 0,
      consistency: 0,
      aspect: 0,
      fill: 0,
      contrastOk: false,
      flatEnough: false,
      borderClear: false,
      litOk: false,
      sizeOk: false,
      aspectOk: false,
      sig: null,
    };

    let data;
    try {
      data = resize(frame, {
        crop: {
          x: Math.round(fw * sx),
          y: Math.round(fh * sy),
          width: Math.round(fw * sw),
          height: Math.round(fh * sh),
        },
        scale: { width: GRID_W, height: GRID_H },
        pixelFormat: "rgb",
        dataType: "uint8",
      });
    } catch {
      return fail;
    }

    const W = GRID_W;
    const H = GRID_H;

    const lum: number[] = new Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = data[i * 3];
      const g = data[i * 3 + 1];
      const b = data[i * 3 + 2];
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const at = (x: number, y: number): number => {
      "worklet";
      let cx = x;
      let cy = y;
      if (cx < 0) cx = 0;
      if (cy < 0) cy = 0;
      if (cx >= W) cx = W - 1;
      if (cy >= H) cy = H - 1;
      return lum[cy * W + cx];
    };

    // We sampled with `pad` margin, so the guide box occupies the inner
    // (1 / (1 + 2*pad)) fraction of the grid. The card is searched for
    // within those bounds; the margin outside them is background.
    const inset = pad / (1 + 2 * pad);
    const ix0 = Math.floor(W * inset);
    const ix1 = Math.ceil(W * (1 - inset));
    const iy0 = Math.floor(H * inset);
    const iy1 = Math.ceil(H * (1 - inset));

    // The card is normally brighter than what's behind it, but not always
    // (a pale card on a white desk). Decide which way round this frame is,
    // then work in a space where the object is always the bright one.
    let cSum = 0;
    let cN = 0;
    for (let y = iy0; y < iy1; y++) {
      for (let x = ix0; x < ix1; x++) {
        cSum += at(x, y);
        cN++;
      }
    }
    const boxMean = cSum / Math.max(cN, 1);

    let mSum = 0;
    let mN = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x < ix0 || x >= ix1 || y < iy0 || y >= iy1) {
          mSum += at(x, y);
          mN++;
        }
      }
    }
    const marginMean = mSum / Math.max(mN, 1);
    const inverted = boxMean < marginMean;
    const val = (x: number, y: number): number => {
      "worklet";
      return inverted ? 255 - at(x, y) : at(x, y);
    };

    // ---- 1) Locate the card ---------------------------------------------
    // Column and row brightness profiles across the box. A card shows up as
    // a raised plateau; the half-way level between the profile's floor and
    // ceiling marks where it begins and ends.
    const nx = ix1 - ix0;
    const ny = iy1 - iy0;
    if (nx < 4 || ny < 4) return fail;

    const colProfile: number[] = new Array(nx);
    for (let i = 0; i < nx; i++) {
      let s = 0;
      for (let y = iy0; y < iy1; y++) s += val(ix0 + i, y);
      colProfile[i] = s / ny;
    }
    const rowProfile: number[] = new Array(ny);
    for (let j = 0; j < ny; j++) {
      let s = 0;
      for (let x = ix0; x < ix1; x++) s += val(x, iy0 + j);
      rowProfile[j] = s / nx;
    }

    const span = (profile: number[], n: number): [number, number, number] => {
      "worklet";
      let lo = profile[0];
      let hi = profile[0];
      for (let i = 1; i < n; i++) {
        if (profile[i] < lo) lo = profile[i];
        if (profile[i] > hi) hi = profile[i];
      }
      const level = (lo + hi) / 2;
      let first = -1;
      let last = -1;
      for (let i = 0; i < n; i++) {
        if (profile[i] >= level) {
          if (first < 0) first = i;
          last = i;
        }
      }
      return [first, last, hi - lo];
    };

    const colSpan = span(colProfile, nx);
    const rowSpan = span(rowProfile, ny);
    if (colSpan[0] < 0 || rowSpan[0] < 0) return fail;

    const x0 = ix0 + colSpan[0];
    const x1 = ix0 + colSpan[1];
    const y0 = iy0 + rowSpan[0];
    const y1 = iy0 + rowSpan[1];

    const cardW = x1 - x0 + 1;
    const cardH = y1 - y0 + 1;

    // ---- 2) Sanity-check the rectangle ----------------------------------
    const fillX = cardW / nx;
    const fillY = cardH / ny;
    const fill = fillX < fillY ? fillX : fillY;
    const sizeOk = fillX >= MIN_FILL && fillY >= MIN_FILL;

    // Convert to real pixel proportions before judging the aspect ratio —
    // the grid is a distorted resample, so grid units alone would lie.
    const pxW = (cardW / W) * sw * fw;
    const pxH = (cardH / H) * sh * fh;
    const aspect = pxW > pxH ? pxW / Math.max(pxH, 1) : pxH / Math.max(pxW, 1);
    const aspectOk = aspect >= ASPECT_MIN && aspect <= ASPECT_MAX;

    // ---- 3) Measure the step across the four FOUND edges ----------------
    // After the inversion normalisation above, the card is always the bright
    // side, so every edge should step positive. Sampling two cells clear of
    // the edge keeps the transition itself out of the measurement.
    let sumL = 0;
    let sumR = 0;
    let okL = 0;
    let okR = 0;
    for (let y = y0; y <= y1; y++) {
      const dL = val(x0 + 1, y) - val(x0 - 2, y);
      const dR = val(x1 - 1, y) - val(x1 + 2, y);
      sumL += dL;
      sumR += dR;
      if (dL > 0) okL++;
      if (dR > 0) okR++;
    }
    let sumT = 0;
    let sumB = 0;
    let okT = 0;
    let okB = 0;
    for (let x = x0; x <= x1; x++) {
      const dT = val(x, y0 + 1) - val(x, y0 - 2);
      const dB = val(x, y1 - 1) - val(x, y1 + 2);
      sumT += dT;
      sumB += dB;
      if (dT > 0) okT++;
      if (dB > 0) okB++;
    }

    const nV = Math.max(cardH, 1);
    const nHo = Math.max(cardW, 1);
    const mL = sumL / nV;
    const mR = sumR / nV;
    const mT = sumT / nHo;
    const mB = sumB / nHo;

    // The card is only as convincing as its least distinct edge.
    let weakest = mL;
    if (mR < weakest) weakest = mR;
    if (mT < weakest) weakest = mT;
    if (mB < weakest) weakest = mB;

    let consistency = okL / nV;
    if (okR / nV < consistency) consistency = okR / nV;
    if (okT / nHo < consistency) consistency = okT / nHo;
    if (okB / nHo < consistency) consistency = okB / nHo;

    const borderClear = weakest >= MIN_SIDE_STEP && consistency >= MIN_SIDE_CONSISTENCY;

    // ---- 4) Interior stats, measured inside the found card --------------
    const mx0 = x0 + Math.floor(cardW * 0.15);
    const mx1 = x1 - Math.floor(cardW * 0.15);
    const my0 = y0 + Math.floor(cardH * 0.15);
    const my1 = y1 - Math.floor(cardH * 0.15);

    let iSum = 0;
    let iN = 0;
    for (let y = my0; y <= my1; y++) {
      for (let x = mx0; x <= mx1; x++) {
        iSum += at(x, y);
        iN++;
      }
    }
    const interiorMean = iSum / Math.max(iN, 1);

    let vSum = 0;
    for (let y = my0; y <= my1; y++) {
      for (let x = mx0; x <= mx1; x++) {
        const d = at(x, y) - interiorMean;
        vSum += d * d;
      }
    }
    const interiorVar = vSum / Math.max(iN, 1);

    // Background is everything in the grid outside the found card.
    let oSum = 0;
    let oN = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x < x0 || x > x1 || y < y0 || y > y1) {
          oSum += at(x, y);
          oN++;
        }
      }
    }
    const outsideMean = oSum / Math.max(oN, 1);

    // ---- Decision -------------------------------------------------------
    const contrast = interiorMean - outsideMean;
    const contrastOk = (contrast < 0 ? -contrast : contrast) > MIN_CONTRAST;
    const flatEnough = interiorVar < MAX_INTERIOR_VAR;
    const litOk = interiorMean > MIN_LUM && interiorMean < MAX_LUM;

    const aligned = sizeOk && aspectOk && borderClear && contrastOk && flatEnough && litOk;

    // Coarse signature of the card interior so the caller can detect motion
    // frame-to-frame: if the card is moving, these values change.
    const sig: number[] = [];
    const fs = [0.3, 0.5, 0.7];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        sig.push(at(x0 + Math.round(cardW * fs[b]), y0 + Math.round(cardH * fs[a])));
      }
    }

    return {
      aligned,
      brightness: interiorMean,
      contrast,
      variance: interiorVar,
      borderStep: weakest,
      consistency,
      aspect,
      fill,
      contrastOk,
      flatEnough,
      borderClear,
      litOk,
      sizeOk,
      aspectOk,
      sig,
    };
  };

  return detect;
}
