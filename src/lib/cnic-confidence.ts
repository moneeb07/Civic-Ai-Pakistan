/*
 * The accuracy gate that sits between OCR and anything the citizen sees.
 *
 *   camera quality -> OCR -> field validation -> THIS -> display / save
 *
 * The rule this file exists to enforce: if the model is not confident, the
 * value does not get shown and does not get stored. A blank box the citizen
 * fills in themselves is a correct outcome; a plausible-looking CNIC digit
 * that the model was unsure about is not, because nothing downstream can tell
 * the two apart once it has been rendered into an input.
 *
 * Pure and framework-free so the policy itself is unit-testable, separately
 * from the Gemini call and the route that uses it.
 */

/** Below this overall confidence, nothing from the read is shown at all. */
export const OVERALL_CONFIDENCE_MIN = 0.75;

/** Per-field bar. A field under this is dropped, even if the read as a whole passed. */
export const FIELD_CONFIDENCE_MIN = 0.7;

/** Address blocks are held to the same bar as identity fields. */
export const ADDRESS_CONFIDENCE_MIN = 0.7;

/**
 * Without these two, the registration has nothing to identify the citizen by,
 * so a read that loses either is not worth showing — it goes back to the camera
 * rather than presenting a half-filled form as if it were a successful scan.
 */
export const CRITICAL_FIELDS = ["fullName", "cnicNumber"] as const;

export type CriticalField = (typeof CRITICAL_FIELDS)[number];

export type GateFailure =
  /** The model itself said it could not read the images. */
  | "unreadable"
  /** It returned values, but with too little confidence in them overall. */
  | "low_confidence"
  /** Name or CNIC number specifically could not be read reliably. */
  | "critical_field_unclear"
  /** An address block was read, but not clearly enough to show. */
  | "address_unclear";

export interface AddressBlockConfidence {
  /** Whether the model returned any address content for this block at all. */
  hasContent: boolean;
  confidence: number;
}

export interface ConfidenceGateInput {
  readable: boolean;
  /** Per-side image quality, straight from the model. Null = that side was not submitted. */
  frontReadable: boolean | null;
  backReadable: boolean | null;
  confidence: number;
  /** Per-field confidence, keyed by field name. A missing entry is treated as unconfident. */
  fieldConfidence: Partial<Record<string, number>>;
  /** Field values AFTER format validation — a malformed CNIC should already be null here. */
  values: Partial<Record<string, string | null>>;
  /** Whether a back image was actually submitted. */
  backScanned: boolean;
  addressBlocks: AddressBlockConfidence[];
}

/**
 * Which physical side of the card a failure points at, so the citizen is only
 * ever asked to retake the side that actually needs it (spec: independent
 * front/back retry). "both" covers a genuinely ambiguous read — the honest
 * answer when the signal does not distinguish the two — never a guess.
 */
export type AffectedSide = "front" | "back" | "both";

export interface ConfidenceGateResult {
  pass: boolean;
  failure: GateFailure | null;
  /** Which side to send the citizen back to. Null when the read passed. */
  affectedSide: AffectedSide | null;
  /** Fields that cleared the bar and may be shown. */
  acceptedFields: string[];
  /** Fields the model returned but was not confident enough about — never shown, never saved. */
  droppedFields: string[];
  /** True when an address block was returned but held back for low confidence. */
  addressWithheld: boolean;
}

function isConfident(confidence: number | undefined): boolean {
  return typeof confidence === "number" && confidence >= FIELD_CONFIDENCE_MIN;
}

/**
 * Turns the model's per-side signal into a retry target.
 *
 * Deliberately conservative: a side is only pointed at when it is explicitly
 * reported bad. If the model says nothing (both null — an older response
 * shape, or genuine uncertainty) this returns "both" rather than guessing,
 * which is exactly the previous behaviour before per-side reporting existed —
 * so a citizen is never sent to retake a side that was never actually
 * implicated.
 */
function sideFromReadability(
  frontReadable: boolean | null,
  backReadable: boolean | null,
): AffectedSide {
  const frontBad = frontReadable === false;
  const backBad = backReadable === false;

  if (frontBad && !backBad) return "front";
  if (backBad && !frontBad) return "back";
  return "both";
}

/**
 * Applies the gate to one extraction result.
 *
 * A failure here is not an error condition — it is the system working. The
 * caller's job on failure is to send the citizen back to the camera with the
 * specific reason, never to fall back to showing the values anyway.
 */
export function evaluateExtractionConfidence(
  input: ConfidenceGateInput,
): ConfidenceGateResult {
  const acceptedFields: string[] = [];
  const droppedFields: string[] = [];

  for (const [field, value] of Object.entries(input.values)) {
    // Nothing was read for this field. That is not a confidence failure —
    // the card may simply not print it — so it is neither accepted nor dropped.
    if (!value) continue;

    if (isConfident(input.fieldConfidence[field])) {
      acceptedFields.push(field);
    } else {
      droppedFields.push(field);
    }
  }

  const withheldAddressBlocks = input.addressBlocks.filter(
    (block) => block.hasContent && block.confidence < ADDRESS_CONFIDENCE_MIN,
  );

  const base = {
    acceptedFields,
    droppedFields,
    addressWithheld: withheldAddressBlocks.length > 0,
  };

  const fail = (failure: GateFailure, affectedSide: AffectedSide): ConfidenceGateResult => ({
    ...base,
    pass: false,
    failure,
    affectedSide,
  });

  if (!input.readable) {
    return fail("unreadable", sideFromReadability(input.frontReadable, input.backReadable));
  }
  if (input.confidence < OVERALL_CONFIDENCE_MIN) {
    return fail("low_confidence", sideFromReadability(input.frontReadable, input.backReadable));
  }

  const criticalMissing = CRITICAL_FIELDS.some(
    (field) => !acceptedFields.includes(field),
  );
  // Name and CNIC number are only ever printed on the front.
  if (criticalMissing) return fail("critical_field_unclear", "front");

  /*
   * The citizen went to the trouble of photographing the back, and the model
   * found address text there but could not read it cleanly. Showing a
   * half-guessed address would be worse than asking for a better photo — and
   * this is exactly the case the "never guess Urdu" rule is about.
   *
   * A back that carries no address at all is a different thing entirely and
   * passes: there is nothing uncertain about a field the card doesn't print.
   */
  // The address is only ever printed on the back.
  if (input.backScanned && base.addressWithheld) return fail("address_unclear", "back");

  return { ...base, pass: true, failure: null, affectedSide: null };
}
