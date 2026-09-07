import { NextResponse } from "next/server";

import {
  CnicExtractionError,
  extractCnicFromImages,
  isExtractorConfigured,
} from "@/services/ai/cnic-extractor";
import { formatCnic, isValidCnicFormat, maskCnic } from "@/lib/cnic";
import { getOrCreateRegistrationSession } from "@/lib/registration/session";

/*
 * POST /api/cnic/extract
 *
 * multipart/form-data { front: File, back?: File } -> whatever the model read
 * off the card.
 *
 * WHAT THIS DELIBERATELY NO LONGER DOES.
 * There used to be a gate here: a confidence score per field, a check on which
 * side of the card each photo showed, and a set of thresholds that could
 * reject the read outright and send the citizen back to the camera with
 * nothing. It is gone, on purpose.
 *
 * The gate was second-guessing the model with a cruder instrument than the
 * model. It could not read the card; it could only read the model's own
 * hedging about the card, and it turned that hedging into a refusal. A photo
 * with a little glare on it — which the model reads perfectly well — became
 * "Picture is not readable", and the citizen was asked to retake a photograph
 * that had already worked.
 *
 * The check that actually matters happens one screen later and always did:
 * every field is editable, and the citizen has the card in their hand. A
 * person comparing their own name and number against the physical card is a
 * far better verifier than any confidence threshold, so the model's reading is
 * returned in full and they confirm it.
 *
 * Images are held in memory for the duration of the request and never written
 * to disk. Nothing extracted is persisted here — the citizen must review and
 * confirm it first (see /api/registration/identity).
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Every field the reader can return, in the order the form shows them.
 *
 * Used to mark all of them as having come from the scan — there is no
 * per-field verdict any more, because there is no longer anything making one.
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

// The model needs a real request; keep this off the static/edge path.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  /*
   * The only checks left, and neither is a judgement about the photograph.
   * A type the model cannot decode and a body larger than the upload limit
   * are facts about the REQUEST — letting either through fails further in,
   * with a worse message.
   */
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
     * The number is TIDIED when it already looks like a CNIC, and passed
     * through untouched when it does not.
     *
     * This is formatting, not validation. The previous version blanked a
     * number that failed the shape test, which meant one misread digit cost
     * the citizen all thirteen and a fresh photograph. Handing back what the
     * model saw leaves them one character to correct.
     */
    const rawCnic = extraction.cnicNumber;
    const cnicIsValid = rawCnic ? isValidCnicFormat(rawCnic) : false;
    const cnicNumber = rawCnic ? (cnicIsValid ? formatCnic(rawCnic) : rawCnic) : null;

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
        cnicNumber,
        cnicMasked: cnicNumber && cnicIsValid ? maskCnic(cnicNumber) : null,
        dateOfBirth: extraction.dateOfBirth,
        dateOfIssue: extraction.dateOfIssue,
        dateOfExpiry: extraction.dateOfExpiry,
        gender: extraction.gender,
        nationality: extraction.nationality,
        confidence: extraction.confidence,
        // Which fields came off the card — drives the "From CNIC" badges.
        extractedFields: ALL_EXTRACTED_FIELDS,
        /*
         * Kept in the payload, always empty. The review screen reads both, and
         * an absent key would be a silent behaviour change in a component that
         * is not otherwise part of this; an empty list says plainly that
         * nothing is being flagged rather than that flagging was forgotten.
         */
        unsureFields: [] as string[],
        advisory: null,
        // True only when the number is CNIC-shaped. NOT a claim of authenticity.
        cnicFormatChecked: cnicIsValid,
        presentAddress: extraction.presentAddress,
        permanentAddress: extraction.permanentAddress,
        backScanned,
        /*
         * The address is "available" whenever the back was photographed. The
         * citizen can see for themselves whether the lines came out right,
         * and they can edit them either way; a scan-side verdict on top of
         * that only ever produced a warning about text sitting legibly on
         * the screen beside it.
         */
        addressOutcome: backScanned ? "available" : "not_printed",
        addressNeedsManualEntry: !backScanned,
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
