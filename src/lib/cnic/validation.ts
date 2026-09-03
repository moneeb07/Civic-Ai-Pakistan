/*
 * The one place an image is judged fit to extract a CNIC from.
 *
 * Every path into registration — live auto-capture, manual shutter, gallery
 * upload — ends here. That is the point: the defect this replaces was two
 * different standards. The camera judged a LIVE FRAME with local pixel
 * heuristics and then never looked at the photo it actually took, and the
 * gallery ran no quality check at all. So a visibly blurred card sailed
 * through to "Use this photo", because nothing downstream of the shutter was
 * ever asked whether the captured image was readable.
 *
 * The rule this module exists to enforce:
 *
 *   "image captured" is NOT "CNIC scanned".
 *
 * A captured image is a candidate. It becomes an accepted scan only after the
 * model has confirmed, field by field, that it can actually READ the card —
 * not that it could plausibly guess it.
 *
 * Pure and framework-free, so every branch is provable without a camera, a
 * network call or a browser. The Gemini call and the pixel maths live
 * elsewhere; this decides what their outputs mean.
 */

/** What the pipeline concluded. Never a bare boolean — the reason is the point. */
export type ValidationState =
  /** Not a Pakistani identity card at all. */
  | "NOT_A_CNIC"
  /** A card, but the information cannot be read. Reject. */
  | "NOT_READABLE"
  /** Readable in part. Close, but not enough to extract from. */
  | "NEEDS_IMPROVEMENT"
  /** Good enough to extract from. */
  | "READABLE";

/** Which side the card is showing, as observed — never as assumed. */
export type CnicSide = "front" | "back";

/**
 * The fields a side must yield before it is worth extracting from.
 *
 * Deliberately per-side. The front carries identity; the back carries address.
 * Demanding a CNIC number from a photograph of the back would reject every
 * correct back image, and demanding an address from the front would reject
 * every correct front — which is precisely the kind of blanket rule that makes
 * a scanner unusable.
 */
export const REQUIRED_FIELDS: Record<CnicSide, string[]> = {
  front: ["cnicNumber", "name", "fatherOrHusbandName", "dateOfBirth"],
  back: ["presentAddress"],
};

/**
 * The acceptance bar, as a 0–100 quality score.
 *
 * 85 rather than 100 on purpose, and the brief is explicit about it: a real
 * hand-held photograph of a laminated card under Pakistani indoor lighting is
 * never pristine, and demanding perfection means nobody ever registers. What
 * changed is that this number is now EARNED — it is computed from measurable
 * evidence (see `scoreFrom`) rather than assumed because an image exists.
 */
export const ACCEPT_SCORE = 85;

/** Below this the image is not worth improving — it is simply not readable. */
export const REJECT_SCORE = 55;

/**
 * The bar the LIVE CAMERA must clear before it fires the shutter.
 *
 * Deliberately well below ACCEPT_SCORE, and the distinction is the whole
 * architecture. These two numbers answer different questions:
 *
 *   CAPTURE_SCORE — "is this frame worth spending a check on?"
 *   ACCEPT_SCORE  — "is this photograph good enough to extract from?"
 *
 * Setting them equal, which an earlier version did, broke auto-capture
 * outright. The local heuristics measure a live video feed — compressed,
 * auto-exposed, shot through a lens that is not macro-focused — and are
 * calibrated against synthetic hard-edged test patterns, so a genuinely good
 * webcam frame scores far below what the same card scores as a still
 * photograph. Demanding 85 from a laptop camera meant the shutter never fired
 * at any distance, however clear the card was.
 *
 * The server's judgement is what actually protects the citizen, and it still
 * runs on every captured image at the full bar. This one only decides when to
 * ask it.
 */
export const CAPTURE_SCORE = 66;

/** Per-field confidence floor. Under this, a field counts as unread. */
export const FIELD_READABLE_MIN = 0.7;

/**
 * Consecutive good frames required before the shutter fires.
 *
 * At the 150ms analysis interval this is about 1.8 seconds of CONTINUOUSLY
 * acceptable frames. It was 5 (~750ms), and that was far too brief: a hand
 * bringing a card up to the lens passes through a moment that measures well
 * while the card is still moving, so the shutter fired on the way in and
 * caught a smeared photograph. Nearly two seconds cannot be crossed
 * accidentally — it requires somebody to actually hold the card still.
 */
export const STABLE_FRAMES_REQUIRED = 12;

/**
 * How long a card must be in frame before auto-capture is even considered.
 *
 * A deliberate grace period, separate from the stability run above. Somebody
 * presenting a card needs a moment to see the guide, line the card up and
 * settle — and a camera that fires the instant a card appears denies them
 * that, then blames them for the blur. The border still turns red, orange and
 * green throughout, so the time is spent usefully: they can see the frame
 * improving before anything is taken.
 */
export const CAPTURE_SETTLE_MS = 1200;

/** Measurable image properties. All 0–1, all derived from actual pixels. */
export interface QualitySignals {
  /** How confident we are a card-shaped document is present at all. */
  documentConfidence: number;
  sharpness: number;
  lighting: number;
  /** 1 = no glare. */
  glareFree: number;
  /** 1 = square to the lens. */
  perspective: number;
  /** 1 = whole card inside the frame at a usable size. */
  completeness: number;
}

/** What the vision model reported about the image it was shown. */
export interface VisionReadability {
  isPakistaniCnic: boolean;
  /** The side actually observed, or null when the model could not tell. */
  observedSide: CnicSide | null;
  /** The model's own verdict, before we apply our own thresholds. */
  readability: "readable" | "partially_readable" | "not_readable";
  /** Overall 0–1. */
  confidence: number;
  /** Per-field 0–1. A field absent from this map counts as unread. */
  fieldConfidence: Partial<Record<string, number>>;
  blurDetected: boolean;
  glareDetected: boolean;
  cropped: boolean;
  perspectiveIssue: boolean;
}

export interface ValidationResult {
  state: ValidationState;
  /** 0–100, derived — never assumed. */
  score: number;
  /** One thing the citizen can physically do. Empty when accepted. */
  instruction: string;
  /** Required fields this image failed to yield. */
  unreadableFields: string[];
  observedSide: CnicSide | null;
  /**
   * Every contributing factor, for the debug panel and for tests.
   * Never rendered to a citizen and never logged in production.
   */
  reasons: string[];
}

/**
 * Turns measured signals into a 0–100 score.
 *
 * Weighted, not averaged. Sharpness and completeness dominate because they are
 * the two properties that actually decide whether characters can be resolved —
 * a slightly dim but sharp photograph of a whole card reads fine; a
 * well-lit, perfectly exposed blur does not.
 *
 * The weights sum to 1, so the result is always 0–100 and a single catastrophic
 * signal cannot be averaged away by five good ones.
 */
export function scoreFrom(signals: QualitySignals): number {
  /*
   * Non-finite input clamps to 0, not to NaN.
   *
   * Math.min(1, NaN) is NaN, and a single NaN propagates through the sum to
   * make the whole score NaN — which then compares false against every
   * threshold, so `score < ACCEPT_SCORE` is false and the image is ACCEPTED.
   * A malformed signal would have opened exactly the hole this module exists
   * to close, so the pessimistic reading is the only safe one.
   */
  const clamp = (value: number) =>
    Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

  const documentConfidence = clamp(signals.documentConfidence);
  const sharpness = clamp(signals.sharpness);
  const completeness = clamp(signals.completeness);

  const weighted =
    documentConfidence * 0.2 +
    sharpness * 0.28 +
    completeness * 0.22 +
    clamp(signals.lighting) * 0.12 +
    clamp(signals.glareFree) * 0.1 +
    clamp(signals.perspective) * 0.08;

  const score = Math.round(weighted * 100);

  /*
   * A weighted sum alone is too forgiving of a single catastrophic failure.
   *
   * A completely smeared frame that happens to be well lit, glare-free, square
   * and fully in shot still collects 50 points from those four axes — enough
   * to show ORANGE ("improve the image") for a frame that is not improvable,
   * it is unreadable. Three of these signals are not contributors but
   * PREREQUISITES: with no sharpness, no document, or most of the card outside
   * the frame, nothing else can rescue it.
   *
   * So the weakest prerequisite caps the total. The card is still scored on
   * every axis; it simply cannot score well on the strength of the axes that
   * do not decide legibility.
   */
  const limiting = Math.min(documentConfidence, sharpness, completeness);
  if (limiting < 0.25) return Math.min(score, 30);
  if (limiting < 0.45) return Math.min(score, REJECT_SCORE - 1);

  return score;
}

/** The single most useful thing to tell the citizen, given what failed. */
function instructionFor(
  signals: QualitySignals | null,
  vision: VisionReadability | null,
): string {
  /*
   * Ordered by what a person can most directly act on. Only ONE is ever
   * shown: a list of five faults is not guidance, it is an error report, and
   * somebody holding a card up to a lens can fix exactly one thing at a time.
   */
  if (vision && !vision.isPakistaniCnic) {
    return "That doesn't look like a Pakistani CNIC. Please show the card itself.";
  }

  if (signals) {
    if (signals.completeness < 0.5) return "Fit the whole CNIC inside the frame.";
    if (signals.documentConfidence < 0.4) return "Move the CNIC closer to the camera.";
    if (signals.sharpness < 0.5) return "Hold the CNIC steady — the text is blurred.";
    if (signals.glareFree < 0.5) return "Tilt the card slightly to avoid the reflection.";
    if (signals.lighting < 0.5) return "Move somewhere brighter.";
    if (signals.perspective < 0.5) return "Hold the card flat and square to the camera.";
  }

  if (vision) {
    if (vision.blurDetected) return "Hold the CNIC steady — the text is blurred.";
    if (vision.glareDetected) return "Tilt the card slightly to avoid the reflection.";
    if (vision.cropped) return "Part of the card is cut off. Fit all four corners in.";
    if (vision.perspectiveIssue) return "Hold the card flat and square to the camera.";
  }

  return "Hold steady — improving image quality.";
}

/**
 * The whole decision, for one image of one side.
 *
 * `signals` is optional because a gallery upload has no live frame history —
 * but the VISION half is never optional, and that is deliberate. Local pixel
 * heuristics can tell you a photo is dark; only actually reading the card can
 * tell you the CNIC number is legible. An image is never accepted on pixel
 * statistics alone.
 */
export function validateCnic(input: {
  expectedSide: CnicSide;
  signals: QualitySignals | null;
  vision: VisionReadability | null;
}): ValidationResult {
  const { expectedSide, signals, vision } = input;
  const reasons: string[] = [];

  // No vision verdict means no verdict. Never optimistic.
  if (!vision) {
    return {
      state: "NOT_READABLE",
      score: 0,
      instruction: "We couldn't check that image. Please try again.",
      unreadableFields: REQUIRED_FIELDS[expectedSide],
      observedSide: null,
      reasons: ["no vision result"],
    };
  }

  if (!vision.isPakistaniCnic) {
    return {
      state: "NOT_A_CNIC",
      score: 0,
      instruction: instructionFor(signals, vision),
      unreadableFields: REQUIRED_FIELDS[expectedSide],
      observedSide: vision.observedSide,
      reasons: ["not a Pakistani CNIC"],
    };
  }

  /*
   * Which required fields could actually be READ.
   *
   * A field the model returned with low confidence counts as unread, exactly
   * as a field it omitted does. This is the rule that stops "OCR produced
   * some characters" from being mistaken for "the card is legible" — the
   * failure mode the brief calls out by name.
   */
  const required = REQUIRED_FIELDS[expectedSide];

  /*
   * Did the model answer the per-field question at all?
   *
   * The distinction matters and getting it wrong rejected perfectly good
   * cards. A field MISSING FROM A POPULATED MAP is a field the model declined
   * to vouch for — that is exactly the "OCR guessed something" case this gate
   * exists to catch, and it counts as unread. But an ENTIRELY EMPTY map is not
   * a statement about any field; it means the model did not break its answer
   * down. Treating that as "every field is illegible" contradicted the model's
   * own verdict, and produced the absurd result of a card reported readable at
   * 0.95 confidence being refused with all four required fields listed as
   * unreadable.
   *
   * With no breakdown, the overall verdict is the only evidence there is, so
   * that is what is used. The bar is not lowered — an image the model called
   * anything less than "readable" still fails below.
   */
  const gaveBreakdown = Object.values(vision.fieldConfidence).some(
    // Presence, not magnitude. An all-zero map IS an answer — the model looked
    // and could read nothing — and must not be mistaken for silence, which
    // would turn the most emphatic rejection there is into a free pass.
    (value) => typeof value === "number",
  );

  const unreadableFields = gaveBreakdown
    ? required.filter((field) => {
        const confidence = vision.fieldConfidence[field];
        return typeof confidence !== "number" || confidence < FIELD_READABLE_MIN;
      })
    : [];

  if (!gaveBreakdown) reasons.push("no per-field breakdown; using overall verdict");

  if (unreadableFields.length > 0) {
    reasons.push(`unreadable fields: ${unreadableFields.join(", ")}`);
  }

  /*
   * The score blends measured pixels with the model's own confidence. When
   * there are no local signals (a gallery upload), the model's confidence
   * carries it alone rather than being padded with an invented pixel score.
   */
  const pixelScore = signals ? scoreFrom(signals) : null;
  const visionScore = Math.round(vision.confidence * 100);
  const score =
    pixelScore === null ? visionScore : Math.round(pixelScore * 0.45 + visionScore * 0.55);

  if (signals) reasons.push(`pixel score ${pixelScore}`);
  reasons.push(`vision confidence ${visionScore}`);
  reasons.push(`model verdict ${vision.readability}`);

  const fail = (state: ValidationState): ValidationResult => ({
    state,
    score,
    instruction: instructionFor(signals, vision),
    unreadableFields,
    observedSide: vision.observedSide,
    reasons,
  });

  // The model's own verdict is authoritative when it is negative. We may
  // refuse an image it liked; we never accept one it called unreadable.
  if (vision.readability === "not_readable") return fail("NOT_READABLE");
  if (score < REJECT_SCORE) return fail("NOT_READABLE");

  // A required field that could not be read is disqualifying regardless of how
  // good the photograph looks — a crisp image of a card whose number is
  // obscured by a thumb is a perfect photograph and a useless scan.
  if (unreadableFields.length > 0) return fail("NEEDS_IMPROVEMENT");
  if (vision.readability === "partially_readable") return fail("NEEDS_IMPROVEMENT");
  if (score < ACCEPT_SCORE) return fail("NEEDS_IMPROVEMENT");

  return {
    state: "READABLE",
    score,
    instruction: "",
    unreadableFields: [],
    observedSide: vision.observedSide,
    reasons,
  };
}

/** Colour band for the capture guide. One tier per state, never invented per screen. */
export function tierFor(state: ValidationState): "red" | "orange" | "green" {
  if (state === "READABLE") return "green";
  if (state === "NEEDS_IMPROVEMENT") return "orange";
  return "red";
}

/**
 * Whether the shutter may fire.
 *
 * Requires BOTH an acceptable frame and a run of them. Splitting this out
 * keeps the temporal rule testable on its own — the bug it prevents (capture
 * on a single lucky frame between two blurred ones) is invisible in a
 * single-frame test.
 */
export function shouldAutoCapture(
  state: ValidationState,
  consecutiveGoodFrames: number,
  /** Milliseconds the card has been continuously in frame. */
  settledMs = Number.POSITIVE_INFINITY,
): boolean {
  return (
    state === "READABLE" &&
    consecutiveGoodFrames >= STABLE_FRAMES_REQUIRED &&
    settledMs >= CAPTURE_SETTLE_MS
  );
}

/* ==========================================================================
 * Live pre-screening
 * ======================================================================== */

/**
 * The guide's colour from pixel signals alone, for the live viewfinder.
 *
 * A deliberately WEAKER judgement than `validateCnic`, and never a substitute
 * for it. The model cannot be asked about every frame at video rate, so the
 * live loop scores what it can measure locally and uses that to decide when
 * the shutter is worth firing. Everything it accepts is then re-judged
 * properly against the captured image.
 *
 * The failure this guards against is the one in the bug report: a frame that
 * looked acceptable to local heuristics produced a photograph nobody ever
 * checked. Local screening now only decides WHEN TO LOOK, never whether the
 * result is good.
 */
export function preScreen(signals: QualitySignals): {
  score: number;
  tier: "red" | "orange" | "green";
  instruction: string;
} {
  const score = scoreFrom(signals);

  /*
   * Green means "the shutter is about to fire", not "this will be accepted".
   * Tying the border to the capture bar keeps it honest: a citizen who sees
   * green and then no photograph has been lied to by the interface.
   */
  const tier: "red" | "orange" | "green" =
    score >= CAPTURE_SCORE ? "green" : score >= 38 ? "orange" : "red";

  return {
    score,
    tier,
    instruction:
      tier === "green" ? "CNIC detected. Hold still…" : instructionFor(signals, null),
  };
}
