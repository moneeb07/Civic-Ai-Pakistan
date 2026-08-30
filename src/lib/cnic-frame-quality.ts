/*
 * Real-time CNIC framing analysis — the logic behind the live red/green
 * capture guide.
 *
 * This is classic pixel-level heuristics (brightness, near-white clipping,
 * foreground/background contrast, edge geometry), not a trained ML model —
 * there is no document-detection model shipped with CivicAI. It runs many
 * times a second in the browser, which a Gemini round-trip cannot do; Gemini
 * still does the one real reading, immediately after this triggers capture.
 * The thresholds below are tuned by hand and are approximate by nature: this
 * module tells a citizen "move closer" or "hold still", never "verified".
 *
 * Framework-free and pure on purpose, so it can be unit-tested with plain
 * pixel buffers — no canvas, no DOM, no browser needed.
 */

/** Structurally compatible with the DOM's ImageData — duck-typed so tests don't need a browser. */
export interface RgbaBuffer {
  data: Uint8ClampedArray | Uint8Array | number[];
  width: number;
  height: number;
}

export type FrameIssue =
  | "no_card"
  | "too_far"
  | "too_close"
  | "incomplete"
  | "tilted"
  | "blurry"
  | "low_light"
  | "glare"
  | "unreadable";

/**
 * Every check, pass/fail, independent of which one won the priority race.
 *
 * The citizen only ever sees one message, but the dev debug panel needs to see
 * all of them at once: "the card is obviously fine, so which check disagrees?"
 * is otherwise a guessing game.
 */
export interface FrameChecks {
  detected: boolean;
  distance: boolean;
  complete: boolean;
  tilt: boolean;
  sharpness: boolean;
  lighting: boolean;
  glare: boolean;
  readability: boolean;
}

/**
 * The three bands the guide's border colour is drawn from.
 *
 *   poor       red    — nothing usable yet, or a plain framing failure
 *   improving  orange — a card is there and being read, but not yet good enough
 *   acceptable green  — readable enough to capture
 *
 * Deliberately three, not two: the old red/green split told a citizen holding
 * a nearly-good card exactly the same thing as one pointing at the ceiling.
 */
export type FrameTier = "poor" | "improving" | "acceptable";

export interface FrameQualityResult {
  ready: boolean;
  /** The single most important problem to show — never more than one at a time. */
  issue: FrameIssue | null;
  /**
   * Estimated readability, 0–100.
   *
   * This is a presentation of the same measurements the checks above use, not
   * a second opinion: by construction it is >= READABLE_THRESHOLD if and only
   * if every check passes, so the number on screen can never contradict the
   * colour of the border beside it.
   *
   * It says nothing about whether the extracted VALUES will be right — that is
   * lib/cnic-confidence.ts's job, after Gemini has actually read the card. This
   * is "how good is this photo", and must only ever be labelled that way.
   */
  readability: number;
  tier: FrameTier;
  /**
   * Where the card sits on the far/close gauge, 0 (far) to 1 (close).
   *
   * Mapped so that the acceptable distance band is always exactly
   * [DISTANCE_BAND_MIN, DISTANCE_BAND_MAX] on the gauge — the UI draws a fixed
   * band and cannot drift out of step with the coverage thresholds here.
   */
  distance: number;
  checks: FrameChecks;
  /** Raw measurements, exposed for tests and for tuning — not shown to citizens. */
  metrics: {
    brightness: number;
    glareRatio: number;
    coverageRatio: number;
    edgeTouchCount: number;
    sharpness: number;
    tiltDegrees: number | null;
    textDetail: number;
  };
}

/*
 * -- Tunable thresholds -------------------------------------------------
 *
 * These are deliberately permissive. The question each one answers is "is
 * there a real risk the OCR reads this wrong?", NOT "is this frame ideal".
 * A card a person can plainly read should pass, tilt and camera noise and
 * all — Gemini copes with far worse than a human eye does, and the accuracy
 * gate downstream (lib/cnic-confidence.ts) is what actually protects against
 * a bad read. Being strict HERE just stops citizens from getting a photo
 * taken at all, which protects nobody.
 *
 * The analysis crop is padded wider than the on-screen guide (see
 * ANALYSIS_PADDING in cnic-capture.tsx), so a card that neatly fills the
 * guide sits at roughly 70% coverage here with clear air on every side.
 * The coverage band below is set around that.
 */

const NO_CARD_COVERAGE_MAX = 0.05;
/**
 * Under this the card is small enough that it's plausibly not even the
 * intended subject. Deliberately low: a card that reads as "far away" to a
 * citizen is often still perfectly legible to Gemini, and this heuristic has
 * no way to know the difference — so it only blocks the clearly-too-small case
 * and leaves the actual judgment to the accuracy gate after capture.
 */
const TOO_FAR_COVERAGE_MAX = 0.16;
/**
 * Over this the card has effectively swallowed the padded crop. With the
 * padding factor applied, a card that neatly fills the on-screen guide lands
 * near 0.7 — so 0.93 means the card is already well past the frame it was
 * asked to fit inside, and its edges are about to leave the picture.
 */
const TOO_CLOSE_COVERAGE_MIN = 0.93;

/** Fraction of an edge line that must be "foreground" to count as touched. */
const EDGE_TOUCH_FRACTION = 0.6;
/** Two or more touched edges means part of the card is genuinely cut off. */
const INCOMPLETE_MIN_EDGES = 2;

/**
 * Generous on purpose. A hand-held card is never square to the lens, and a
 * modest rotation costs OCR nothing — this is here to catch a card lying
 * diagonally across the frame, not to demand a straight edge.
 */
const TILT_THRESHOLD_DEGREES = 22;

/**
 * Below this, local contrast is too smooth for ANY printed card — a blank
 * sheet of paper, not merely a soft real-world photo. A live camera feed is
 * inherently smoother than the synthetic hard-edged test patterns this module
 * was originally tuned against (video compression, auto-exposure, a lens
 * that isn't macro-focused all soften real contrast well below what looks
 * "sharp" on a synthetic scene), so this only needs to catch genuine motion
 * blur, not merely "not crisp".
 */
const BLUR_SHARPNESS_MIN = 2.5;

/**
 * Readability floor — a smoke test, not a confidence check.
 *
 * This heuristic (fraction of the card's pixels sitting on a strong local
 * luminance transition) is a crude, unvalidated proxy for "there is print
 * here" — nowhere near as reliable as actually reading the card, which is
 * exactly what Gemini does immediately after capture, field by field, with
 * real per-field confidence (see lib/cnic-confidence.ts). That downstream gate
 * is the thing that actually protects a citizen from a wrong value; this
 * local check only exists to catch the camera pointed at a blank wall or the
 * ceiling. Set low enough that it should never fire on an actual CNIC, however
 * marginal the photo.
 */
const TEXT_EDGE_LUMINANCE_MIN = 14;
const TEXT_DETAIL_MIN = 0.006;

/**
 * Indoor Pakistani lighting at night is dim, not unreadable, and a phone
 * camera's own auto-exposure already does most of the work here. Only reject
 * a scene that is close to genuinely dark.
 */
const BRIGHTNESS_LOW_MAX = 35;

/**
 * Pixels this close to pure white, at this density, indicate a glare hotspot.
 * A small specular highlight on a laminated card is normal and harmless; this
 * is looking for a blown-out patch large enough to plausibly swallow a field.
 */
const GLARE_CHANNEL_MIN = 250;
const GLARE_RATIO_MAX = 0.16;

/** How far (0–255 scale, per channel) a pixel must be from the background colour to count as "card". */
const BACKGROUND_DISTANCE_THRESHOLD = 40;

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function colourDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

/**
 * Background colour, sampled from a thin ring around the crop's perimeter.
 *
 * A well-framed card leaves a visible margin, so the outermost pixels are the
 * one place we can be confident is background rather than document — but a
 * card positioned close to one corner can still contaminate a block sample
 * taken there. The median across the whole ring is used rather than the mean
 * specifically so that a few contaminated pixels (say, one corner where the
 * card reaches near the edge) can't drag the estimate away from the true
 * background colour the way an average would.
 */
function estimateBackground(
  data: RgbaBuffer["data"],
  width: number,
  height: number,
): [number, number, number] {
  const thickness = Math.max(1, Math.round(Math.min(width, height) * 0.02));

  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];

  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    reds.push(data[i]);
    greens.push(data[i + 1]);
    blues.push(data[i + 2]);
  };

  for (let y = 0; y < thickness; y++) {
    for (let x = 0; x < width; x++) {
      sample(x, y);
      sample(x, height - 1 - y);
    }
  }
  for (let x = 0; x < thickness; x++) {
    for (let y = 0; y < height; y++) {
      sample(x, y);
      sample(width - 1 - x, y);
    }
  }

  const median = (values: number[]) => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };

  return reds.length > 0
    ? [median(reds), median(greens), median(blues)]
    : [255, 255, 255];
}

/** True where a pixel differs enough from the background to be "the card". */
function classifyForeground(
  data: RgbaBuffer["data"],
  width: number,
  height: number,
  background: [number, number, number],
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const [bgR, bgG, bgB] = background;

  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    const distance = colourDistance(data[i], data[i + 1], data[i + 2], bgR, bgG, bgB);
    mask[p] = distance > BACKGROUND_DISTANCE_THRESHOLD ? 1 : 0;
  }

  return mask;
}

function edgeTouchFraction(
  mask: Uint8Array,
  width: number,
  height: number,
  edge: "top" | "bottom" | "left" | "right",
): number {
  let touched = 0;
  let total = 0;

  if (edge === "top" || edge === "bottom") {
    const y = edge === "top" ? 0 : height - 1;
    for (let x = 0; x < width; x++) {
      touched += mask[y * width + x];
      total++;
    }
  } else {
    const x = edge === "left" ? 0 : width - 1;
    for (let y = 0; y < height; y++) {
      touched += mask[y * width + x];
      total++;
    }
  }

  return total > 0 ? touched / total : 0;
}

/**
 * Approximate rotation, in degrees, estimated from how the card's left and
 * right silhouette edges drift across sample rows. A perfectly upright card
 * has vertical edges (roughly constant x per row); a tilted one drifts.
 *
 * Returns null when there isn't enough signal to trust an estimate — a
 * missing tilt reading is treated as "not tilted" rather than guessed at.
 */
function estimateTiltDegrees(
  mask: Uint8Array,
  width: number,
  height: number,
): number | null {
  const sampleRows = 10;
  const marginTop = Math.floor(height * 0.15);
  const marginBottom = Math.floor(height * 0.85);
  const step = Math.max(1, Math.floor((marginBottom - marginTop) / sampleRows));

  const leftPoints: [number, number][] = [];
  const rightPoints: [number, number][] = [];

  for (let y = marginTop; y < marginBottom; y += step) {
    let leftX = -1;
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) {
        leftX = x;
        break;
      }
    }
    // Only trust it if the row actually starts with background (a real edge
    // crossing), not a row where the card already fills the left border.
    if (leftX > 1) leftPoints.push([leftX, y]);

    let rightX = -1;
    for (let x = width - 1; x >= 0; x--) {
      if (mask[y * width + x] === 1) {
        rightX = x;
        break;
      }
    }
    if (rightX >= 0 && rightX < width - 2) rightPoints.push([rightX, y]);
  }

  const angleFromPoints = (points: [number, number][]): number | null => {
    if (points.length < 3) return null;
    const first = points[0];
    const last = points[points.length - 1];
    const deltaX = last[0] - first[0];
    const deltaY = last[1] - first[1];
    if (deltaY === 0) return null;
    return (Math.atan2(deltaX, deltaY) * 180) / Math.PI;
  };

  const leftAngle = angleFromPoints(leftPoints);
  const rightAngle = angleFromPoints(rightPoints);

  if (leftAngle === null && rightAngle === null) return null;
  if (leftAngle === null) return rightAngle;
  if (rightAngle === null) return leftAngle;
  return (leftAngle + rightAngle) / 2;
}

/** Mean absolute luminance difference between horizontal neighbours — a cheap focus proxy. */
function estimateSharpness(
  data: RgbaBuffer["data"],
  width: number,
  height: number,
): number {
  let total = 0;
  let count = 0;

  // Every 2nd row/column is plenty for a stable estimate and keeps this cheap.
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const i = (y * width + x) * 4;
      const iRight = (y * width + x + 1) * 4;
      const l1 = luminance(data[i], data[i + 1], data[i + 2]);
      const l2 = luminance(data[iRight], data[iRight + 1], data[iRight + 2]);
      total += Math.abs(l1 - l2);
      count++;
    }
  }

  return count > 0 ? total / count : 0;
}

/**
 * Fraction of the card's own pixels that sit on a strong local luminance
 * transition — a proxy for "there is resolvable printed text here".
 *
 * Restricted to the foreground mask on purpose: the background behind the card
 * (a desk edge, a patterned tablecloth) can carry plenty of detail of its own,
 * and none of it says anything about whether the CNIC can be read.
 */
function estimateTextDetail(
  data: RgbaBuffer["data"],
  width: number,
  height: number,
  mask: Uint8Array,
): number {
  let strong = 0;
  let counted = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      if (mask[p] === 0) continue;

      const pRight = p + 1;
      const pDown = p + width;

      const i = p * 4;
      const iRight = pRight * 4;
      const iDown = pDown * 4;

      const here = luminance(data[i], data[i + 1], data[i + 2]);
      const right = luminance(data[iRight], data[iRight + 1], data[iRight + 2]);
      const down = luminance(data[iDown], data[iDown + 1], data[iDown + 2]);

      counted++;

      /*
       * A neighbour outside the mask is background, not card — the jump at
       * that boundary is the card's own silhouette, not printed detail. Left
       * unguarded, every pixel along the card's outer edge scores as a
       * "strong transition" purely from contrast with the background behind
       * it, which floods the signal for any solid-coloured test rectangle
       * (and, at the actual card's photographed edge, for a real one too) and
       * makes a threshold low enough to mean anything impossible to set.
       * Counting only transitions between two pixels that are BOTH card
       * measures interior print contrast specifically.
       */
      if (
        (mask[pRight] === 1 && Math.abs(here - right) > TEXT_EDGE_LUMINANCE_MIN) ||
        (mask[pDown] === 1 && Math.abs(here - down) > TEXT_EDGE_LUMINANCE_MIN)
      ) {
        strong++;
      }
    }
  }

  return counted > 0 ? strong / counted : 0;
}

/*
 * -- Readability score ---------------------------------------------------
 *
 * The bands come straight from the product spec: below 61 is poor, 61-84 is
 * "needs improvement", 85 and over is good enough to capture. The point of
 * the 85 line is that it is NOT a demand for a perfect photo — a card a person
 * can plainly read should clear it, and the real protection against a wrong
 * value is the per-field confidence gate after Gemini reads the card.
 */
export const READABLE_THRESHOLD = 85;
export const IMPROVING_THRESHOLD = 61;

/** The acceptable stretch of the far/close gauge, in gauge coordinates. */
export const DISTANCE_BAND_MIN = 0.35;
export const DISTANCE_BAND_MAX = 0.75;

/**
 * 0 at `fail`, 1 at `pass`, linear between, clamped outside. `fail` may sit
 * either above or below `pass`, so a metric that gets worse as it grows
 * (glare) uses the same helper as one that gets better (sharpness).
 */
function ramp(value: number, fail: number, pass: number): number {
  if (fail === pass) return value >= pass ? 1 : 0;
  const t = (value - fail) / (pass - fail);
  return Math.min(1, Math.max(0, t));
}

/*
 * How much each dimension moves the score. Sharpness, distance and printed
 * detail carry the most weight because they are what actually decides whether
 * text can be read; tilt and a modest specular highlight carry the least,
 * because OCR shrugs both off.
 */
const SCORE_WEIGHTS = {
  distance: 3,
  complete: 2,
  tilt: 1,
  sharpness: 3,
  lighting: 2,
  glare: 1,
  detail: 3,
} as const;

/**
 * Per-dimension quality, each 0 (hopeless) to 1 (ideal).
 *
 * These are intentionally smooth, unlike the hard pass/fail checks: the score
 * exists to show a citizen that moving the card is *helping*, which a boolean
 * cannot express.
 */
function subScores(metrics: FrameQualityResult["metrics"]) {
  const { coverageRatio, edgeTouchCount, tiltDegrees, sharpness, brightness, glareRatio, textDetail } =
    metrics;

  /*
   * Inside the acceptable coverage band, distance is ideal — there is no
   * "more correct" spot within it. Outside, it tapers toward 0, scaled below
   * 1 so an out-of-band frame can never score as well as an in-band one.
   */
  const distance =
    coverageRatio < TOO_FAR_COVERAGE_MAX
      ? ramp(coverageRatio, 0, TOO_FAR_COVERAGE_MAX) * 0.8
      : coverageRatio > TOO_CLOSE_COVERAGE_MIN
        ? ramp(coverageRatio, 1, TOO_CLOSE_COVERAGE_MIN) * 0.8
        : 1;

  return {
    distance,
    complete: 1 - Math.min(1, edgeTouchCount / 4),
    tilt:
      tiltDegrees === null
        ? 1
        : 1 - Math.min(1, Math.abs(tiltDegrees) / (TILT_THRESHOLD_DEGREES * 2)),
    // Each "pass" point is set at ~2.5x its own floor, so merely clearing a
    // threshold reads as adequate rather than excellent.
    sharpness: ramp(sharpness, 0, BLUR_SHARPNESS_MIN * 2.5),
    lighting: ramp(brightness, 0, BRIGHTNESS_LOW_MAX * 2.5),
    glare: ramp(glareRatio, GLARE_RATIO_MAX * 2, 0),
    detail: ramp(textDetail, 0, TEXT_DETAIL_MIN * 5),
  };
}

/**
 * Collapses the sub-scores into the single 0-100 number shown on screen.
 *
 * The split around READABLE_THRESHOLD is what keeps the number honest: a frame
 * with every check passing lands in 85-100, one with any check failing lands
 * in 0-84, and no arithmetic can put a red border next to "87% readable".
 */
/*
 * Framing failures are always red, never orange, however good the rest of the
 * frame is. Orange means "a readable card, nearly good enough"; a card that is
 * absent, too far, too close or half out of shot is none of those, and telling
 * someone their photo is 68% good while the card is off the edge of the screen
 * invites them to just press the shutter.
 */
const FRAMING_ISSUES = new Set<FrameIssue>([
  "no_card",
  "too_far",
  "too_close",
  "incomplete",
]);

function readabilityScore(
  metrics: FrameQualityResult["metrics"],
  checks: FrameChecks,
  issue: FrameIssue | null,
): number {
  const scores = subScores(metrics);

  let weighted = 0;
  let total = 0;
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    weighted += scores[key as keyof typeof scores] * weight;
    total += weight;
  }
  const quality = total > 0 ? weighted / total : 0;

  const allPassed = Object.values(checks).every(Boolean);

  if (allPassed) {
    return Math.round(READABLE_THRESHOLD + (100 - READABLE_THRESHOLD) * quality);
  }

  /*
   * A framing failure is squeezed proportionally into the red band rather than
   * simply clamped there, so the number still moves as the citizen improves
   * the shot — the gradient is the whole reason to show a number at all.
   */
  const ceiling = FRAMING_ISSUES.has(issue as FrameIssue)
    ? IMPROVING_THRESHOLD - 1
    : READABLE_THRESHOLD - 1;

  return Math.round(ceiling * quality);
}

/**
 * Coverage expressed as a position on the far/close gauge, pinned so that the
 * acceptable band always occupies [DISTANCE_BAND_MIN, DISTANCE_BAND_MAX].
 */
function distancePosition(coverageRatio: number): number {
  if (coverageRatio <= TOO_FAR_COVERAGE_MAX) {
    return ramp(coverageRatio, 0, TOO_FAR_COVERAGE_MAX) * DISTANCE_BAND_MIN;
  }
  if (coverageRatio >= TOO_CLOSE_COVERAGE_MIN) {
    return (
      DISTANCE_BAND_MAX +
      ramp(coverageRatio, TOO_CLOSE_COVERAGE_MIN, 1) * (1 - DISTANCE_BAND_MAX)
    );
  }
  return (
    DISTANCE_BAND_MIN +
    ramp(coverageRatio, TOO_FAR_COVERAGE_MAX, TOO_CLOSE_COVERAGE_MIN) *
      (DISTANCE_BAND_MAX - DISTANCE_BAND_MIN)
  );
}

/**
 * Analyses one downsampled crop of the on-screen guide frame and returns the
 * single most important issue to show, in priority order — framing problems
 * before lighting nuance, since there is no point telling someone about glare
 * on a card that isn't even in frame yet.
 */
export function analyzeCnicFrame(buffer: RgbaBuffer): FrameQualityResult {
  const { data, width, height } = buffer;
  const pixelCount = width * height;

  // -- Brightness ---------------------------------------------------------
  let luminanceSum = 0;
  let glareCount = 0;

  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    luminanceSum += luminance(r, g, b);
    if (r > GLARE_CHANNEL_MIN && g > GLARE_CHANNEL_MIN && b > GLARE_CHANNEL_MIN) {
      glareCount++;
    }
  }

  const brightness = luminanceSum / pixelCount;
  const glareRatio = glareCount / pixelCount;

  // -- Foreground / framing -------------------------------------------------
  const background = estimateBackground(data, width, height);
  const mask = classifyForeground(data, width, height, background);

  let foregroundCount = 0;
  for (let p = 0; p < pixelCount; p++) foregroundCount += mask[p];
  const coverageRatio = foregroundCount / pixelCount;

  const edgeTouchCount = (["top", "bottom", "left", "right"] as const).filter(
    (edge) => edgeTouchFraction(mask, width, height, edge) > EDGE_TOUCH_FRACTION,
  ).length;

  const tiltDegrees = estimateTiltDegrees(mask, width, height);
  const sharpness = estimateSharpness(data, width, height);
  const textDetail = estimateTextDetail(data, width, height, mask);

  const metrics = {
    brightness,
    glareRatio,
    coverageRatio,
    edgeTouchCount,
    sharpness,
    tiltDegrees,
    textDetail,
  };

  /*
   * Every check is evaluated, always — not short-circuited at the first
   * failure. The citizen is shown one message, but the debug panel needs the
   * whole picture to answer "the card looks fine, so what is objecting?".
   */
  const checks: FrameChecks = {
    detected: coverageRatio >= NO_CARD_COVERAGE_MAX,
    distance:
      coverageRatio >= TOO_FAR_COVERAGE_MAX && coverageRatio <= TOO_CLOSE_COVERAGE_MIN,
    complete: edgeTouchCount < INCOMPLETE_MIN_EDGES,
    tilt: tiltDegrees === null || Math.abs(tiltDegrees) <= TILT_THRESHOLD_DEGREES,
    sharpness: sharpness >= BLUR_SHARPNESS_MIN,
    lighting: brightness >= BRIGHTNESS_LOW_MAX,
    glare: glareRatio <= GLARE_RATIO_MAX,
    readability: textDetail >= TEXT_DETAIL_MIN,
  };

  // -- Priority-ordered message ---------------------------------------------
  let issue: FrameIssue | null = null;

  if (!checks.detected) {
    issue = "no_card";
  } else if (coverageRatio < TOO_FAR_COVERAGE_MAX) {
    issue = "too_far";
  } else if (coverageRatio > TOO_CLOSE_COVERAGE_MIN) {
    issue = "too_close";
  } else if (!checks.complete) {
    issue = "incomplete";
  } else if (!checks.tilt) {
    issue = "tilted";
  } else if (!checks.sharpness) {
    issue = "blurry";
  } else if (!checks.lighting) {
    issue = "low_light";
  } else if (!checks.glare) {
    issue = "glare";
  } else if (!checks.readability) {
    // Last in the order on purpose. Everything measurable is fine, yet there is
    // still no legible print — so the guidance falls back to the honest,
    // non-specific ask rather than inventing a cause.
    issue = "unreadable";
  }

  const readability = readabilityScore(metrics, checks, issue);

  /*
   * The tier reads straight off the score, which is exactly why the score is
   * built the way it is: the border colour and the percentage beside it are
   * two views of one number and cannot disagree.
   */
  const tier: FrameTier =
    readability >= READABLE_THRESHOLD
      ? "acceptable"
      : readability >= IMPROVING_THRESHOLD
        ? "improving"
        : "poor";

  return {
    ready: issue === null,
    issue,
    readability,
    tier,
    distance: distancePosition(coverageRatio),
    checks,
    metrics,
  };
}
