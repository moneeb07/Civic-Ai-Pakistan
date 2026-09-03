import { NextResponse } from "next/server";

import {
  CnicValidationError,
  isValidatorConfigured,
  validateCnicImage,
} from "@/services/gemini/cnic-validator";
import { validateCnic, type CnicSide, type QualitySignals } from "@/lib/cnic/validation";
import { getOrCreateRegistrationSession } from "@/lib/registration/session";

/*
 * POST /api/cnic/validate
 *
 * multipart/form-data { image: File, side: "front"|"back", signals?: JSON }
 *   -> { state, score, instruction, unreadableFields, observedSide }
 *
 * The single gate every captured or uploaded image passes through before the
 * registration flow will accept it. The camera calls it with local pixel
 * signals attached; the gallery calls it without them. Same endpoint, same
 * decision function, same thresholds — which is the entire point: the defect
 * this replaces was the camera and the gallery applying different standards,
 * and the captured photo never being checked at all.
 *
 * Images are held in memory for the life of the request and never written to
 * disk, never persisted, and never logged.
 */

const MAX_BYTES = 12 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Local pixel signals, when the caller has them. Malformed input is ignored, never trusted. */
function parseSignals(raw: FormDataEntryValue | null): QualitySignals | null {
  if (typeof raw !== "string") return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const read = (key: string) => {
      const value = parsed[key];
      return typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : null;
    };

    const documentConfidence = read("documentConfidence");
    const sharpness = read("sharpness");
    const lighting = read("lighting");
    const glareFree = read("glareFree");
    const perspective = read("perspective");
    const completeness = read("completeness");

    // Partial signals are worse than none: a missing sharpness silently
    // treated as 0 would reject every gallery upload, and treated as 1 would
    // wave through every blur. All or nothing.
    if (
      documentConfidence === null ||
      sharpness === null ||
      lighting === null ||
      glareFree === null ||
      perspective === null ||
      completeness === null
    ) {
      return null;
    }

    return { documentConfidence, sharpness, lighting, glareFree, perspective, completeness };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!isValidatorConfigured()) {
    /*
     * Without the model there is no readability judgement to be had. The flow
     * falls back to manual entry rather than accepting images unchecked —
     * "the validator is down" must never mean "everything passes".
     */
    return NextResponse.json(
      {
        success: false,
        reason: "not_configured",
        message:
          "CNIC scanning is unavailable right now. You can enter your details manually instead.",
      },
      { status: 503 },
    );
  }

  // An onboarding session must exist, so this cannot be used as an anonymous
  // image-analysis service.
  await getOrCreateRegistrationSession();

  let file: File | null = null;
  let side: CnicSide = "front";
  let signals: QualitySignals | null = null;

  try {
    const form = await request.formData();
    const image = form.get("image");
    if (image instanceof File) file = image;

    const rawSide = form.get("side");
    if (rawSide === "back") side = "back";

    signals = parseSignals(form.get("signals"));
  } catch {
    return NextResponse.json(
      { success: false, reason: "invalid_request", message: "We couldn't read that upload." },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json(
      { success: false, reason: "invalid_request", message: "No image was provided." },
      { status: 400 },
    );
  }

  if (!ACCEPTED.has(file.type)) {
    return NextResponse.json(
      {
        success: false,
        reason: "unsupported_type",
        message: "Please use a JPEG, PNG or WebP image.",
      },
      { status: 415 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        success: false,
        reason: "too_large",
        message: "That image is too large. Please retake the photo.",
      },
      { status: 413 },
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const vision = await validateCnicImage({ bytes, mimeType: file.type }, side);

    const result = validateCnic({ expectedSide: side, signals, vision });

    /*
     * `reasons` carries the individual contributing factors and is useful only
     * while developing. It is withheld in production: it describes the
     * legibility of somebody's identity document, which is not something to
     * ship to a browser console.
     */
    const debug =
      process.env.NODE_ENV === "production"
        ? undefined
        : { reasons: result.reasons, visionConfidence: vision.confidence };

    return NextResponse.json({
      success: true,
      data: {
        state: result.state,
        score: result.score,
        instruction: result.instruction,
        unreadableFields: result.unreadableFields,
        observedSide: result.observedSide,
        expectedSide: side,
        debug,
      },
    });
  } catch (error) {
    if (error instanceof CnicValidationError) {
      /*
       * Each failure gets its own words. "We couldn't check that image" for a
       * quota problem sends somebody off to re-photograph a card that was
       * never at fault — which is exactly the confusion being fixed.
       */
      const message =
        error.reason === "quota_exhausted"
          ? "CNIC scanning has reached today's usage limit on this account. Your photo is fine — you can enter your details by hand instead, or try again tomorrow."
          : error.reason === "rate_limited"
            ? error.retryAfterSeconds
              ? `Our scanning service is busy. Please wait about ${error.retryAfterSeconds} seconds and check again — your photo is fine.`
              : "Our scanning service is busy right now. Please wait a moment and check again — your photo is fine."
            : "We couldn't check that image right now. Please try again.";

      return NextResponse.json(
        {
          success: false,
          reason: error.reason,
          retryAfterSeconds: error.retryAfterSeconds,
          message,
        },
        {
          status:
            error.reason === "not_configured"
              ? 503
              : error.reason === "rate_limited" || error.reason === "quota_exhausted"
                ? 429
                : 502,
        },
      );
    }

    console.error("[cnic-validate] unexpected failure");
    return NextResponse.json(
      { success: false, reason: "unexpected", message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
