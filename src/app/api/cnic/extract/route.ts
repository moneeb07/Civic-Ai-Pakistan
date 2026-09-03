import { NextResponse } from "next/server";

import {
  CnicExtractionError,
  extractCnicFromImages,
  isGeminiConfigured,
} from "@/services/gemini/cnic-extractor";
import { formatCnic, isValidCnicFormat, maskCnic } from "@/lib/cnic";
import { ADDRESS_CONFIDENCE_MIN, type GateFailure } from "@/lib/cnic-confidence";
import { type SideFailure } from "@/lib/cnic-side-check";
import { decideExtraction } from "@/lib/cnic-decision";
import { getOrCreateRegistrationSession } from "@/lib/registration/session";

/*
 * POST /api/cnic/extract
 *
 * multipart/form-data { front: File, back?: File } -> structured, validated
 * CNIC fields, including present/permanent address read off the back.
 *
 * Images are held in memory for the duration of the request and never written
 * to disk. Nothing extracted is persisted here — the citizen must review and
 * confirm it first (see /api/registration/identity).
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

// Gemini needs a real request; keep this off the static/edge path.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * One message per gate failure. Every one of them names something the citizen
 * can actually change — never "extraction failed", which tells them nothing
 * and leaves them retaking the same bad photo.
 */

/*
 * The wrong-side messages.
 *
 * Each one says which side is in front of the camera and what to physically do
 * about it. "Please retake the image" — the old catch-all — is useless here:
 * the photo was perfectly sharp, it was just of the wrong half of the card,
 * and a citizen told to retake it will take the same wrong photo again.
 */
const SIDE_MESSAGES: Record<SideFailure, string> = {
  front_is_back:
    "That looks like the back of your CNIC. Please turn the card over and show the side with your photograph on it.",
  back_is_front:
    "That's the front of your CNIC again. Please turn the card over — the address is printed on the other side.",
  same_side_twice:
    "Both photos show the same side of your CNIC. Please photograph the other side too.",
  sides_swapped:
    "The two photos are the wrong way round — the front and back have been swapped. Let's take them again: start with the side that has your photograph on it.",
};

const GATE_MESSAGES: Record<GateFailure, string> = {
  unreadable:
    "I can't read the CNIC clearly. Please adjust the lighting, distance, or position and try again.",
  low_confidence:
    "Some CNIC information is unclear. Please retake the image with better lighting and focus.",
  critical_field_unclear:
    "I couldn't clearly read your name and CNIC number. Please retake the image with better lighting and focus.",
  address_unclear:
    "I couldn't clearly read the address on the back of your CNIC. Please retake the image with better lighting and focus.",
};

export async function POST(request: Request) {
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      {
        success: false,
        reason: "not_configured",
        message:
          "CNIC scanning is not available right now. You can enter your CNIC details manually instead.",
      },
      { status: 503 },
    );
  }

  // An onboarding session must exist before a CNIC image is accepted, so this
  // endpoint cannot be used as an anonymous image-analysis service.
  await getOrCreateRegistrationSession();

  let frontFile: File | null = null;
  let backFile: File | null = null;

  try {
    const form = await request.formData();
    const frontValue = form.get("front");
    const backValue = form.get("back");
    if (frontValue instanceof File) frontFile = frontValue;
    if (backValue instanceof File) backFile = backValue;
  } catch {
    return NextResponse.json(
      { success: false, reason: "invalid_request", message: "We couldn't read that upload." },
      { status: 400 },
    );
  }

  if (!frontFile) {
    return NextResponse.json(
      { success: false, reason: "invalid_request", message: "Please provide the front of your CNIC." },
      { status: 400 },
    );
  }

  for (const file of [frontFile, backFile].filter(Boolean) as File[]) {
    if (!ACCEPTED.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          reason: "unsupported_type",
          message: "Please upload a JPEG, PNG or WebP image.",
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
  }

  try {
    const frontBytes = Buffer.from(await frontFile.arrayBuffer());
    const backBytes = backFile ? Buffer.from(await backFile.arrayBuffer()) : undefined;

    const extraction = await extractCnicFromImages(
      { bytes: frontBytes, mimeType: frontFile.type },
      backBytes && backFile ? { bytes: backBytes, mimeType: backFile.type } : undefined,
    );

    const backScanned = Boolean(backFile);

    /*
     * Gemini's output is untrusted. A number that is not CNIC-shaped is dropped
     * rather than shown to the citizen as if it had been read successfully.
     */
    const rawCnic = extraction.cnicNumber;
    const cnicIsValid = rawCnic ? isValidCnicFormat(rawCnic) : false;
    const cnicNumber = cnicIsValid ? formatCnic(rawCnic!) : null;

    /*
     * The entire decision — which side is in the photo, whether the values are
     * safe to show, and what became of the address — lives in
     * lib/cnic-decision.ts as one pure function, so the ORDER of those checks
     * (which is load-bearing) is provable without a Gemini key or a session.
     */
    const decision = decideExtraction({
      readable: extraction.readable,
      frontReadable: extraction.frontReadable,
      backReadable: extraction.backReadable,
      frontImageSide: extraction.frontImageSide,
      backImageSide: extraction.backImageSide,
      confidence: extraction.confidence,
      fieldConfidence: extraction.fieldConfidence,
      values: {
        fullName: extraction.fullName,
        fatherName: extraction.fatherName,
        cnicNumber,
        dateOfBirth: extraction.dateOfBirth,
        dateOfIssue: extraction.dateOfIssue,
        dateOfExpiry: extraction.dateOfExpiry,
        gender: extraction.gender,
        nationality: extraction.nationality,
      },
      backScanned,
      presentAddress: extraction.presentAddress,
      permanentAddress: extraction.permanentAddress,
      addressConfidenceMin: ADDRESS_CONFIDENCE_MIN,
    });

    if (decision.kind === "wrong_side") {
      return NextResponse.json(
        {
          success: false,
          reason: "wrong_side",
          sideFailure: decision.failure,
          /*
           * Only the offending photo is discarded — a good front is never
           * thrown away because the back was the wrong side. The exception is
           * a swap, where neither photo is in the right slot and "both" is the
           * honest answer.
           */
          affectedSide: decision.retakeBoth ? "both" : decision.retake,
          message: SIDE_MESSAGES[decision.failure],
        },
        { status: 422 },
      );
    }

    if (decision.kind === "rejected") {
      return NextResponse.json(
        {
          success: false,
          reason: "low_confidence",
          gateFailure: decision.failure,
          /*
           * Which physical side to retake. "both" means the model condemned
           * both images and neither photo is worth keeping; "unknown" means it
           * implicated neither, so the client keeps what it has.
           */
          affectedSide: decision.affectedSide,
          message: GATE_MESSAGES[decision.failure],
        },
        { status: 422 },
      );
    }

    /*
     * Only fields that cleared the per-field bar survive. A field the model
     * returned but was unsure about is blanked here — the citizen sees an
     * empty box to fill in, never a plausible-looking wrong value.
     */
    const accepted = new Set(decision.acceptedFields);
    const keep = <T,>(field: string, value: T): T | null =>
      accepted.has(field) ? value : null;

    const safeCnic = keep("cnicNumber", cnicNumber);

    /*
     * The response carries the full CNIC exactly once, because the citizen has
     * to see it to check it. It is masked for display everywhere afterwards and
     * encrypted the moment they confirm. It is never logged. Addresses are not
     * masked — they are not the same sensitivity class as a national ID number.
     */
    return NextResponse.json({
      success: true,
      data: {
        fullName: keep("fullName", extraction.fullName),
        fatherName: keep("fatherName", extraction.fatherName),
        cnicNumber: safeCnic,
        cnicMasked: safeCnic ? maskCnic(safeCnic) : null,
        dateOfBirth: keep("dateOfBirth", extraction.dateOfBirth),
        dateOfIssue: keep("dateOfIssue", extraction.dateOfIssue),
        dateOfExpiry: keep("dateOfExpiry", extraction.dateOfExpiry),
        gender: keep("gender", extraction.gender),
        nationality: keep("nationality", extraction.nationality),
        confidence: extraction.confidence,
        // Which fields actually came off the card AND cleared the bar —
        // drives the "From CNIC" badges.
        extractedFields: decision.acceptedFields,
        /** Fields read but withheld for low confidence, so the UI can say so. */
        withheldFields: decision.droppedFields,
        // True only when the number is CNIC-shaped. NOT a claim of authenticity.
        cnicFormatChecked: cnicIsValid,
        presentAddress: decision.presentAddress,
        permanentAddress: decision.permanentAddress,
        backScanned,
        /*
         * "available" | "partial" | "unreadable" | "not_printed", plus the
         * flag the UI must act on. The citizen is never left with an
         * unexplained blank address.
         */
        addressOutcome: decision.addressOutcome,
        addressNeedsManualEntry: decision.addressNeedsManualEntry,
      },
    });
  } catch (error) {
    if (error instanceof CnicExtractionError) {
      const status = error.reason === "not_configured" ? 503 : 502;
      return NextResponse.json(
        {
          success: false,
          reason: error.reason,
          message:
            "We couldn't process your CNIC right now. Please try again, or enter your details manually.",
        },
        { status },
      );
    }

    console.error("[cnic-extract] unexpected failure");
    return NextResponse.json(
      {
        success: false,
        reason: "unexpected",
        message: "Something went wrong. Please try again.",
      },
      { status: 500 },
    );
  }
}
