import { NextResponse } from "next/server";

import {
  CnicExtractionError,
  extractCnicFromImages,
  isExtractorConfigured,
} from "@/services/ai/cnic-extractor";
import { formatCnic, isValidCnicFormat, maskCnic } from "@/lib/cnic";
import { ADDRESS_CONFIDENCE_MIN, type GateFailure } from "@/lib/cnic-confidence";

/**
 * Every field the reader can return, in the order the form shows them.
 *
 * Used when the gate rejected the read outright: there is no per-field verdict
 * to consult in that case, so everything is marked "check this" rather than
 * silently presenting a wholesale-doubted read as if it were trusted.
 */
const ALL_EXTRACTED_FIELDS = [
  "fullName",
  "fatherName",
  "cnicNumber",
  "dateOfBirth",
  "dateOfIssue",
  "dateOfExpiry",
  "gender",
  "nationality",
] as const;
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
  if (!isExtractorConfigured()) {
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

    /*
     * THE GATE IS ADVISORY, NOT BLOCKING.
     *
     * It used to return 422 here and send the citizen back to the camera with
     * nothing: a read the model was unsure about was discarded outright, on
     * the reasoning that an empty box is safer than a plausible wrong value.
     *
     * That reasoning holds only if the citizen never sees the value. They do —
     * every field on the next screen is editable, and checking their own name
     * and CNIC number against the card in their hand is something a person is
     * far better at than a confidence score is. Discarding the read made them
     * retake a photograph and then type all nine fields by hand, which is
     * slower AND more error-prone than correcting one wrong digit.
     *
     * So the read always comes back now. What the gate decided is reported
     * alongside it — `unsureFields` drives a "check this" marker on exactly
     * the fields the model hedged on, and `advisory` carries the human
     * sentence explaining what went wrong with the photograph. The citizen
     * decides, with the card in front of them, instead of the score deciding
     * for them.
     */
    const unsureFields =
      decision.kind === "accepted" ? decision.droppedFields : ALL_EXTRACTED_FIELDS;

    const advisory =
      decision.kind === "wrong_side"
        ? SIDE_MESSAGES[decision.failure]
        : decision.kind === "rejected"
          ? GATE_MESSAGES[decision.failure]
          : null;

    /*
     * Every value the model read is returned, including the ones it hedged on.
     * `unsureFields` says which to flag; nothing is blanked.
     */
    const safeCnic = cnicNumber;

    /*
     * The response carries the full CNIC exactly once, because the citizen has
     * to see it to check it. It is masked for display everywhere afterwards and
     * encrypted the moment they confirm. It is never logged. Addresses are not
     * masked — they are not the same sensitivity class as a national ID number.
     */
    return NextResponse.json({
      success: true,
      data: {
        fullName: extraction.fullName,
        fatherName: extraction.fatherName,
        cnicNumber: safeCnic,
        cnicMasked: safeCnic ? maskCnic(safeCnic) : null,
        dateOfBirth: extraction.dateOfBirth,
        dateOfIssue: extraction.dateOfIssue,
        dateOfExpiry: extraction.dateOfExpiry,
        gender: extraction.gender,
        nationality: extraction.nationality,
        confidence: extraction.confidence,
        // Which fields came off the card — drives the "From CNIC" badges.
        extractedFields:
          decision.kind === "accepted" ? decision.acceptedFields : ALL_EXTRACTED_FIELDS,
        /** Fields the model hedged on. Shown and editable, but marked "check this". */
        unsureFields,
        /** A plain sentence about the photograph, or null when it read cleanly. */
        advisory,
        // True only when the number is CNIC-shaped. NOT a claim of authenticity.
        cnicFormatChecked: cnicIsValid,
        /*
         * Only the "accepted" decision reasons about addresses — the reject
         * paths bail out before that work is done. So the raw read is used
         * there, on the same principle as every other field: show what the
         * model saw and let the citizen correct it, rather than blanking an
         * address because the gate never got round to judging it.
         */
        presentAddress:
          decision.kind === "accepted" ? decision.presentAddress : extraction.presentAddress,
        permanentAddress:
          decision.kind === "accepted" ? decision.permanentAddress : extraction.permanentAddress,
        backScanned,
        /*
         * "available" | "partial" | "unreadable" | "not_printed", plus the
         * flag the UI must act on. The citizen is never left with an
         * unexplained blank address.
         */
        addressOutcome: decision.kind === "accepted" ? decision.addressOutcome : "partial",
        addressNeedsManualEntry:
          decision.kind === "accepted" ? decision.addressNeedsManualEntry : !backScanned,
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
